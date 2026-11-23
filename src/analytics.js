/* أقوال — بوت النشر التلقائي على صفحة فيسبوك
 * Cloudflare Worker + D1 + Gemini + Wikimedia Commons
 *
 * المتغيرات المطلوبة (wrangler secret put):
 *   ADMIN_KEY           مفتاح لوحة التحكم
 *   GEMINI_API_KEY      مفتاح Gemini
 *   PAGE_ACCESS_TOKEN   توكن صفحة فيسبوك
 * المتغيرات الاختيارية:
 *   FB_PAGE_ID          رقم الصفحة (الافتراضي: القيمة القديمة أدناه)
 *   GEMINI_MODEL        نموذج Gemini (الافتراضي: gemini-3.5-flash-lite)
 * إعدادات في جدول auto_settings:
 *   require_image       (الافتراضي 1) لا يُنشر أي منشور بدون صورة
 */

/* ---------- قاعدة البيانات ---------- */


/* ---------- تحليلات فيسبوك: جمع مقاييس الأداء وإطعامها للتوليد ---------- */

import { GRAPH_VERSION } from "./config.js";
import { ensureAutoSchema } from "./db.js";

const INSIGHT_METRICS = "post_impressions,post_impressions_unique,post_engaged_users";

/* نقاط التفاعل: التعليق والمشاركة أثقل من الإعجاب */
function computeScore(m) {
 return (m.reactions || 0) + 3 * (m.comments || 0) + 5 * (m.shares || 0) +
  Math.round((m.engaged_users || 0) / 10);
}

/* مقاييس منشور واحد: عدادات المنشور + الوصول من Insights إن توفرت الصلاحية */
async function fetchPostMetrics(env, fbPostId) {
 if (!env.PAGE_ACCESS_TOKEN) throw Error("PAGE_ACCESS_TOKEN غير مضبوط");

 const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${fbPostId}`);

 u.searchParams.set(
  "fields",
  "shares,comments.summary(total_count).limit(0),reactions.summary(total_count).limit(0)"
 );
 u.searchParams.set("access_token", env.PAGE_ACCESS_TOKEN);

 const r = await fetch(u);
 const d = await r.json();

 if (!r.ok) throw Error(d.error?.message || "تعذر قراءة المنشور");

 const metrics = {
  reach: 0,
  impressions: 0,
  engaged_users: 0,
  reactions: d.reactions?.summary?.total_count || 0,
  comments: d.comments?.summary?.total_count || 0,
  shares: d.shares?.count || 0,
  insights_error: null
 };

 try {
  const iu = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${fbPostId}/insights`);

  iu.searchParams.set("metric", INSIGHT_METRICS);
  iu.searchParams.set("access_token", env.PAGE_ACCESS_TOKEN);

  const ir = await fetch(iu);
  const id = await ir.json();

  if (!ir.ok) throw Error(id.error?.message || "HTTP " + ir.status);

  for (const row of id.data || []) {
   const v = Number(row.values?.[0]?.value) || 0;

   if (row.name === "post_impressions") metrics.impressions = v;
   if (row.name === "post_impressions_unique") metrics.reach = v;
   if (row.name === "post_engaged_users") metrics.engaged_users = v;
  }
 } catch (e) {
  metrics.insights_error = String(e.message || e).slice(0, 200);
 }

 return metrics;
}

async function saveMetrics(env, postId, fbPostId, m) {
 await env.DB.prepare(
  `INSERT OR REPLACE INTO post_analytics
   (post_id,fb_post_id,reach,impressions,engaged_users,reactions,comments,shares,score,fetched_at)
   VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`
 ).bind(
  postId, fbPostId, m.reach, m.impressions, m.engaged_users,
  m.reactions, m.comments, m.shares, computeScore(m)
 ).run();
}

/* مسح أحدث المنشورات المنشورة وجمع مقاييسها — يُستدعى كل ساعة عبر القائمة */
async function scanAnalytics(env, { limit = 20 } = {}) {
 await ensureAutoSchema(env.DB);

 const posts = (await env.DB.prepare(
  "SELECT id,facebook_post_id FROM posts WHERE status='published' AND facebook_post_id IS NOT NULL ORDER BY id DESC LIMIT ?"
 ).bind(limit).all()).results || [];

 let scanned = 0;
 let failed = 0;
 let lastError = null;
 let insightsError = null;

 for (const p of posts) {
  try {
   const m = await fetchPostMetrics(env, p.facebook_post_id);

   await saveMetrics(env, p.id, p.facebook_post_id, m);
   scanned++;

   if (m.insights_error && !insightsError) insightsError = m.insights_error;
  } catch (e) {
   failed++;
   lastError = String(e.message || e).slice(0, 200);
  }
 }

 return { scanned, failed, lastError, insightsError, total: posts.length };
}

/* أعلى المنشورات نقاطاً — تغذية راجعة لموجه التوليد */
async function topPerformers(env, limit = 5) {
 await ensureAutoSchema(env.DB);

 return (await env.DB.prepare(
  `SELECT p.id,p.content,p.post_type,a.reach,a.reactions,a.comments,a.shares,a.score
   FROM post_analytics a JOIN posts p ON p.id=a.post_id
   WHERE a.score > 0 ORDER BY a.score DESC LIMIT ?`
 ).bind(limit).all()).results || [];
}

/* متوسط الأداء لكل تصنيف — لتفضيل ما ينجح في اختيار الموضوع ولوحة التحكم */
async function categoryPerformance(env) {
 await ensureAutoSchema(env.DB);

 return (await env.DB.prepare(
  `SELECT p.post_type AS category,COUNT(*) AS posts,AVG(a.score) AS avg_score,AVG(a.reach) AS avg_reach,
   SUM(a.reactions) AS reactions,SUM(a.comments) AS comments,SUM(a.shares) AS shares
   FROM post_analytics a JOIN posts p ON p.id=a.post_id
   GROUP BY p.post_type ORDER BY avg_score DESC`
 ).all()).results || [];
}

/* نظرة عامة للوحة التحكم */
async function analyticsOverview(env) {
 await ensureAutoSchema(env.DB);

 const summary = await env.DB.prepare(
  `SELECT COUNT(*) AS measured,AVG(reach) AS avg_reach,AVG(score) AS avg_score,
   SUM(reactions) AS reactions,SUM(comments) AS comments,SUM(shares) AS shares
   FROM post_analytics`
 ).first();

 const recent = (await env.DB.prepare(
  `SELECT p.id,p.content,p.post_type,p.published_at,
   a.reach,a.impressions,a.engaged_users,a.reactions,a.comments,a.shares,a.score,a.fetched_at
   FROM post_analytics a JOIN posts p ON p.id=a.post_id
   ORDER BY p.id DESC LIMIT 20`
 ).all()).results || [];

 return { summary: summary || {}, recent };
}

export {
 computeScore, fetchPostMetrics, scanAnalytics,
 topPerformers, categoryPerformance, analyticsOverview
};
