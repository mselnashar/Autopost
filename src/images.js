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
import { sleep } from "./config.js";
import { ensureAutoSchema } from "./db.js";
import { callGemini } from "./gemini.js";

/* ---------- البحث عن صورة مرتبطة بالموضوع ---------- */

/* مهم: ويكيميديا تطلب User-Agent حقيقياً — ضع بريدك الفعلي هنا */
let WIKI_UA = "AqwalBot/1.0 (https://github.com/mselnashar/Autopost; aqwal-bot@example.com)";

/* ضع بريدك الحقيقي في متغير WIKI_CONTACT (vars في wrangler.jsonc) — بدونه قد ترفض ويكيميديا الطلبات */
let wikiWarned = false;
function applyWikiUA(env) {
 if (env.WIKI_CONTACT) {
  WIKI_UA = "AqwalBot/1.0 (https://github.com/mselnashar/Autopost; " + env.WIKI_CONTACT + ")";
 } else if (!wikiWarned) {
  wikiWarned = true;
  console.warn("تحذير: WIKI_CONTACT غير مضبوط — ويكيميديا قد ترفض أو تحدّ طلبات الصور. أضف بريدك الحقيقي في vars داخل wrangler.jsonc");
 }
}
const OK_LICENSES = [
 "public domain", "cc0",
 "cc by 2.0", "cc by 3.0", "cc by 4.0",
 "cc by-sa 2.0", "cc by-sa 3.0", "cc by-sa 4.0"
];
const MIN_IMG_W = 500;
const MIN_IMG_H = 400;

/* تراخيص ويكيميديا الحرة: المجال العام (PD-...)، CC0، CC BY، CC BY-SA */
const licenseOk = l => /^pd([\s-]|$)|public domain|^cc0|^cc[ -]by(-sa)?[ -][2-4]\.0/i.test(String(l || "").trim());

/* ويكيميديا لا تقبل إلا أحجاماً قياسية (960، 1280...) وقد ترفض أو تحدّ الطلبات */
async function fetchWikiImage(imageUrl) {
 const tries = [imageUrl];

 if (/\/\d+px-/.test(imageUrl)) {
  for (const w of [960, 500]) {
   tries.push(imageUrl.replace(/\/\d+px-/, "/" + w + "px-"));
  }
 }

 let last = 0;

 for (let i = 0; i < tries.length; i++) {
  if (i) await sleep(700);

  const r = await fetch(tries[i], { headers: { "User-Agent": WIKI_UA } });

  if (r.ok) return r;
  last = r.status;
 }

 throw Error("تعذر تحميل الصورة (" + last + ")");
}

async function requireImage(env) {
 await ensureAutoSchema(env.DB);
 const s = await env.DB.prepare(
  "SELECT value FROM auto_settings WHERE key='require_image'"
 ).first();
 return s?.value !== "0";
}

/* ترجمة الموضوع لعبارة إنجليزية قصيرة (مع تخزين في auto_topics.topic_en) */
async function topicToEnglish(env, topic, context = "") {
 if (!context) {
  const cached = await env.DB.prepare(
   "SELECT topic_en FROM auto_topics WHERE topic=?"
  ).bind(topic).first();

  if (cached?.topic_en) return cached.topic_en;
 }

 if (!env.GEMINI_API_KEY) return "";

 try {
  const d = await callGemini(env, {
   contents: [{
    role: "user",
    parts: [{
     text: context
      ? "Read this Arabic text and return only a short English Wikimedia Commons image search phrase (2-5 words) for its main subject (a person, place, or object):\n\n" + context.slice(0, 600)
      : "Translate this Arabic topic to a short English search phrase (2-5 words), return only the phrase: " + topic
    }]
   }],
   generationConfig: { temperature: 0, maxOutputTokens: 100 }
  }, { attempts: 1 });
  const en = (d.candidates?.[0]?.content?.parts || [])
   .map(x => x.text || "").join("")
   .replace(/["'\n]/g, " ").trim().slice(0, 80);

  if (en && !context) {
   await env.DB.prepare(
    "UPDATE auto_topics SET topic_en=? WHERE topic=?"
   ).bind(en, topic).run();
  }

  return en;
 } catch (e) {
  return "";
 }
}

/* بحث ويكيميديا كومنز مع التصفية (نوع الملف، الأبعاد، الترخيص) */
async function searchCommons(query) {
 const api = new URL("https://commons.wikimedia.org/w/api.php");

 api.searchParams.set("action", "query");
 api.searchParams.set("generator", "search");
 api.searchParams.set("gsrsearch", query + " filetype:bitmap");
 api.searchParams.set("gsrnamespace", "6");
 api.searchParams.set("gsrlimit", "20");
 api.searchParams.set("prop", "imageinfo");
 api.searchParams.set("iiprop", "url|extmetadata|size|mime");
 api.searchParams.set("iiurlwidth", "1280");
 api.searchParams.set("format", "json");

 const response = await fetch(api, { headers: { "User-Agent": WIKI_UA } });

 if (!response.ok) throw Error("تعذر البحث عن الصور");

 const data = await response.json();

 return Object.values(data.query?.pages || {})
  .map(p => {
   const i = p.imageinfo?.[0];
   if (!i?.thumburl || !i.descriptionurl) return null;
   if (!["image/jpeg", "image/png"].includes(i.mime)) return null;
   if (i.width < MIN_IMG_W || i.height < MIN_IMG_H) return null;

   const meta = i.extmetadata || {};
   const license = cleanHtml(meta.LicenseShortName?.value);

   if (!licenseOk(license)) return null;

   return {
    url: i.thumburl,
    page: i.descriptionurl,
    author: cleanHtml(meta.Artist?.value).slice(0, 120),
    license,
    landscape: i.width > i.height
   };
  })
  .filter(Boolean)
  .sort((a, b) => b.landscape - a.landscape);
}

/* يرجع صورة دائماً أو يرمي خطأ. حد أقصى بحثان، ثم الصور الاحتياطية */
async function findTopicImage(env, topic, { postId = null, skip = [], context = "" } = {}) {
 const t0 = Date.now();
 await ensureAutoSchema(env.DB);

 let topicEn = "";
 let found = 0;
 let image = null;
 let usedFallback = 0;
 let error = null;

 try {
  topicEn = await topicToEnglish(env, topic, context);
  const queries = [...new Set([
   topicEn,
   topicEn.split(/\s+/).slice(0, 2).join(" "),
   topic
  ].filter(Boolean))].slice(0, 3);

  for (let i = 0; i < queries.length && !image; i++) {
   if (i) await sleep(250);
   const list = (await searchCommons(queries[i])).filter(x => !skip.includes(x.url));
   found += list.length;
   image = list[0] || null;
  }
 } catch (e) {
  error = String(e.message || e);
 }

 if (!image) {
  const rows = (await env.DB.prepare(
   "SELECT * FROM fallback_images ORDER BY last_used_at IS NOT NULL,last_used_at,id LIMIT 10"
  ).all()).results || [];

  const fb = rows.find(x => !skip.includes(x.url));

  if (fb) {
   await env.DB.prepare(
    "UPDATE fallback_images SET last_used_at=CURRENT_TIMESTAMP WHERE id=?"
   ).bind(fb.id).run();

   image = {
    url: fb.url,
    page: fb.page_url || fb.url,
    author: fb.author || "",
    license: fb.license || ""
   };
   usedFallback = 1;
  } else {
   error = error || "لم يتم العثور على صورة مناسبة ولا توجد صور احتياطية";
  }
 }

 let logId = null;

 try {
  const log = await env.DB.prepare(
   "INSERT INTO image_logs (post_id,topic,topic_en,candidates_found,chosen_url,fallback_used,duration_ms,error) VALUES (?,?,?,?,?,?,?,?)"
  ).bind(
   postId, topic, topicEn, found, image?.url || null,
   usedFallback, Date.now() - t0, error
  ).run();
  logId = log.meta.last_row_id;
 } catch (e) {
  console.log("image_logs:", e.message);
 }

 if (!image) throw Error(error);

 return {
  url: image.url,
  page: image.page,
  author: image.author,
  license: image.license,
  fallback: usedFallback,
  logId
 };
}

async function saveImageToPost(env, postId, image) {
 await env.DB.prepare(
  "UPDATE posts SET image_url=?,image_page=?,image_author=?,image_license=? WHERE id=?"
 ).bind(
  image.url, image.page, image.author || null, image.license || null, postId
 ).run();

 if (image.logId) {
  await env.DB.prepare(
   "UPDATE image_logs SET post_id=? WHERE id=?"
  ).bind(postId, image.logId).run();
 }
}

/* القصص لا تدعم نصاً مرافقاً، فلا نستخدم تلقائياً إلا صوراً لا تشترط ذكر المصدر */
const isCreditFree = license => /public domain|cc0|^pd([\s-]|$)/i.test(license || "");

export { WIKI_UA, applyWikiUA, licenseOk, isCreditFree, fetchWikiImage, requireImage, topicToEnglish, searchCommons, findTopicImage, saveImageToPost };
