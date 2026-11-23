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
import { TOPICS } from "./config.js";
import { ensureAutoSchema } from "./db.js";
import { cairoSlot, getHours } from "./time.js";
import { generateAutoContent, generateArticle } from "./generation.js";
import { findTopicImage, requireImage, isCreditFree } from "./images.js";
import { getBlogHours, buildBlogHtml, publishBlogPost } from "./blog.js";
import { publishPost, publishStoryFromUrl } from "./facebook.js";
import { notify } from "./notify.js";

/* ---------- اختيار موضوع النشر التلقائي ---------- */

/* مواضيعك أولاً، ثم القائمة المدمجة (إن كانت مفعّلة) */
async function pickTopic(env, used) {
 await ensureAutoSchema(env.DB);

 const custom = ((await env.DB.prepare(
  "SELECT category,topic FROM custom_topics ORDER BY id"
 ).all()).results || []).map(r => [r.category, r.topic]);

 const setting = await env.DB.prepare(
  "SELECT value FROM auto_settings WHERE key='use_builtin'"
 ).first();

 const all = [...custom, ...(setting?.value === "0" ? [] : TOPICS)];

 if (!all.length) {
  throw Error("لا توجد مواضيع: أضف مواضيع من الإعدادات أو فعّل القائمة المدمجة");
 }

 const fresh = x => !used.has(x[1]);
 const freshCustom = custom.filter(fresh);
 const freshAll = all.filter(fresh);

 const pool = freshCustom.length ? freshCustom : (freshAll.length ? freshAll : all);

 return pool[Math.floor(Math.random() * pool.length)];
}

/* ---------- تشغيل النشر التلقائي ---------- */

/* وضع المسودات التلقائية (اختياري): AUTO_DRAFT=1 يحفظ المنشور المولّد كمسودة للمراجعة اليدوية بدل النشر المباشر */
function autoDraftEnabled(env) {
 const v = String(env.AUTO_DRAFT || "").trim().toLowerCase();
 return v === "1" || v === "true" || v === "yes";
}

async function runAutomaticPost(env, scheduledTime) {
 await ensureAutoSchema(env.DB);

 const setting = await env.DB.prepare(
  "SELECT value FROM auto_settings WHERE key='enabled'"
 ).first();

 if (setting?.value !== "1") return;

 const slot = cairoSlot(new Date(scheduledTime));

 const hours = await getHours(env);

 if (slot.minute !== 0 || !hours.includes(slot.hour)) return;

 try {
  await env.DB.prepare(
   "INSERT INTO auto_runs (slot_key,status,message) VALUES (?,'running','بدأ تجهيز المنشور')"
  ).bind(slot.key).run();
 } catch (e) {
  if (String(e.message || e).toLowerCase().includes("unique")) return;
  throw e;
 }

 let topic = null;
 let category = null;
 let postId = null;

 try {
  const old = await env.DB.prepare(
   "SELECT topic FROM auto_topics ORDER BY id DESC LIMIT 30"
  ).all();

  const used = new Set((old.results || []).map(x => x.topic));

  [category, topic] = await pickTopic(env, used);

  /* الصورة أولاً: إن لم توجد وكان require_image مفعّلاً يتوقف التشغيل ويُسجَّل السبب */
  let image = null;
  try {
   image = await findTopicImage(env, topic);
  } catch (e) {
   if (await requireImage(env)) throw e;
   console.log("Image search:", e.message);
  }

  /* إنشاء المحتوى */
  /* مقال المدونة في الساعات المخصصة له — فشله لا يمنع منشور فيسبوك */
  let blogNote = "";
  let blog = null;

  if (!autoDraftEnabled(env) && (await getBlogHours(env)).includes(slot.hour)) {
   try {
    const article = await generateArticle(env, topic, category);

    blog = await publishBlogPost(env, {
     title: article.title,
     html: buildBlogHtml(article.body, image),
     labels: ["ALL", category]
    });

    blogNote = " + مقال: " + blog.url;
   } catch (e) {
    blogNote = " (تعذر نشر المقال: " + String(e.message || e).slice(0, 150) + ")";
   }
  }

  let content = await generateAutoContent(env, topic, category);

  if (blog) content += "\n\n📖 اقرأ المقال كاملاً: " + blog.url;

  /* حفظ المسودة */
  const saved = await env.DB.prepare(
   `INSERT INTO posts
    (content,post_type,status,image_url,image_page,image_author,image_license)
    VALUES (?,?,'draft',?,?,?,?)`
  ).bind(
   content,
   category,
   image?.url || null,
   image?.page || null,
   image?.author || null,
   image?.license || null
  ).run();

  postId = saved.meta.last_row_id;

  if (image?.logId) {
   await env.DB.prepare(
    "UPDATE image_logs SET post_id=? WHERE id=?"
   ).bind(postId, image.logId).run();
  }

  /* وضع المسودات: يكتفي بالحفظ ويترك النشر للموافقة اليدوية من لوحة التحكم */
  if (autoDraftEnabled(env)) {
   await env.DB.prepare(
    "INSERT OR IGNORE INTO auto_topics (topic,category) VALUES (?,?)"
   ).bind(topic, category).run();

   await env.DB.prepare(
    "UPDATE auto_runs SET status='success',post_id=?,topic=?,message=? WHERE slot_key=?"
   ).bind(postId, topic, "محفوظ كمسودة بانتظار الموافقة (وضع AUTO_DRAFT)", slot.key).run();

   await notify(
    env,
    "📝 مسودة تلقائية جديدة بانتظار المراجعة\n" +
    "الموضوع: " + (topic || "—") + "\n" +
    "رقم المسودة: " + postId
   );

   return;
  }

  /* النشر */
  const fbId = await publishPost(env, content, image);

  /* تحديث حالة المنشور */
  await env.DB.prepare(
   "UPDATE posts SET status='published',facebook_post_id=?,published_at=CURRENT_TIMESTAMP WHERE id=?"
  ).bind(fbId, postId).run();

  await env.DB.prepare(
   "INSERT OR IGNORE INTO auto_topics (topic,category) VALUES (?,?)"
  ).bind(topic, category).run();

  await env.DB.prepare(
   "INSERT INTO publish_logs (post_id,result,message,fb_post_id,image_url) VALUES (?,'success',?,?,?)"
  ).bind(postId, fbId, fbId, image?.url || null).run();

  /* قصة تلقائية (اختيارية) — فشلها لا يؤثر على المنشور */
  let storyNote = "";

  try {
   if (image?.url && await autoStoryEnabled(env)) {
    if (isCreditFree(image.license)) {
     storyNote = " + قصة: " + await publishStoryFromUrl(env, image.url);
    } else {
     storyNote = " (لم تُنشر قصة: الصورة تشترط ذكر المصدر)";
    }
   }
  } catch (e) {
   storyNote = " (تعذر نشر القصة: " + String(e.message || e).slice(0, 150) + ")";
  }

  await env.DB.prepare(
   "UPDATE auto_runs SET status='success',post_id=?,topic=?,message=? WHERE slot_key=?"
  ).bind(postId, topic, "تم النشر: " + fbId + storyNote + blogNote, slot.key).run();
 } catch (e) {
  const msg = String(e.message || e).slice(0, 900);

  await env.DB.prepare(
   "INSERT INTO publish_logs (post_id,result,message) VALUES (?,'failed',?)"
  ).bind(postId, msg).run();

  await env.DB.prepare(
   "UPDATE auto_runs SET status='failed',post_id=?,topic=?,message=? WHERE slot_key=?"
  ).bind(postId, topic, msg, slot.key).run();

  await notify(
   env,
   "❌ فشل النشر التلقائي\n" +
   "الموعد: " + slot.hour + ":00 (القاهرة)\n" +
   "الموضوع: " + (topic || "—") + "\n" +
   "السبب: " + msg.slice(0, 600) +
   (/token|oauth|session|permission/i.test(msg)
    ? "\n🔑 غالباً توكن فيسبوك انتهى أو ينقصه صلاحية."
    : "")
  );

  throw e;
 }
}

export { pickTopic, autoDraftEnabled, runAutomaticPost };
