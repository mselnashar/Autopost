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

const DEFAULT_PAGE_ID = "282216368809712";
const GRAPH_VERSION = "v27.0";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_HOURS = [2, 6, 10, 14, 18, 22];

const TOPICS = [
 ["تاريخ مصر","الحياة اليومية في مصر القديمة"],
 ["التاريخ العربي","بيت الحكمة وحركة الترجمة في بغداد"],
 ["التاريخ العالمي","مدينة بومبي قبل ثوران البركان"],
 ["شخصيات مؤثرة","ابن الهيثم وأثره في المنهج العلمي"],
 ["ألغاز تاريخية","لغز مستعمرة رونوك"],
 ["الثقافة والعلوم","كيف غيّر اختراع الورق مسار المعرفة؟"],
 ["قصص إنسانية","قصة تضامن إنساني غيّرت حياة أشخاص"],
 ["تاريخ مصر","قصة إنشاء مكتبة الإسكندرية القديمة"],
 ["التاريخ العربي","رحلات ابن بطوطة"],
 ["التاريخ العالمي","اكتشاف حجر رشيد وفك رموزه"],
 ["شخصيات مؤثرة","ماري كوري ورحلتها العلمية"],
 ["الثقافة والعلوم","كيف تعمل الذاكرة البشرية؟"],
 ["تاريخ مصر","قصة قناة السويس"],
 ["التاريخ العربي","الخوارزمي وتطور علم الجبر"],
 ["الثقافة والعلوم","لماذا نرى البرق قبل سماع الرعد؟"]
];

function json(data, status = 200) {
 return Response.json(data, { status });
}

function pageId(env) {
 return env.FB_PAGE_ID || DEFAULT_PAGE_ID;
}

/* ---------- قاعدة البيانات ---------- */

let postsReady = false;
let logsReady = false;
let autoReady = false;

/* إضافة الأعمدة الناقصة للجداول القديمة (SQLite لا يدعم ADD COLUMN IF NOT EXISTS) */
async function addMissingColumns(DB, table, cols) {
 const info = await DB.prepare(`PRAGMA table_info(${table})`).all();
 const have = new Set((info.results || []).map(r => r.name));

 for (const [name, type] of cols) {
  if (!have.has(name)) {
   await DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
  }
 }
}

async function ensurePostsSchema(DB) {
 if (postsReady) return;

 await DB.prepare(
  `CREATE TABLE IF NOT EXISTS posts (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   content TEXT NOT NULL,
   post_type TEXT,
   status TEXT NOT NULL DEFAULT 'draft',
   facebook_post_id TEXT,
   published_at DATETIME,
   image_url TEXT,
   image_page TEXT,
   image_author TEXT,
   image_license TEXT,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
 ).run();

 await addMissingColumns(DB, "posts", [
  ["image_url", "TEXT"],
  ["image_page", "TEXT"],
  ["image_author", "TEXT"],
  ["image_license", "TEXT"]
 ]);

 postsReady = true;
}

async function ensurePublishLogsSchema(DB) {
 if (logsReady) return;

 await DB.prepare(
  `CREATE TABLE IF NOT EXISTS publish_logs (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   post_id INTEGER,
   result TEXT NOT NULL,
   message TEXT,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
 ).run();

 await addMissingColumns(DB, "publish_logs", [
  ["fb_post_id", "TEXT"],
  ["image_url", "TEXT"]
 ]);

 logsReady = true;
}

async function ensureAutoSchema(DB) {
 if (autoReady) return;

 await ensurePostsSchema(DB);
 await ensurePublishLogsSchema(DB);

 await DB.prepare(
  "CREATE TABLE IF NOT EXISTS auto_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)"
 ).run();

 await DB.prepare(
  "INSERT OR IGNORE INTO auto_settings (key,value) VALUES ('enabled','0')"
 ).run();

 await DB.prepare(
  "INSERT OR IGNORE INTO auto_settings (key,value) VALUES ('require_image','1')"
 ).run();

 await DB.prepare(
  "INSERT OR IGNORE INTO auto_settings (key,value) VALUES ('hours','2,6,10,14,18,22')"
 ).run();

 await DB.prepare(
  "INSERT OR IGNORE INTO auto_settings (key,value) VALUES ('auto_story','0')"
 ).run();

 await DB.prepare(
  "CREATE TABLE IF NOT EXISTS auto_topics (id INTEGER PRIMARY KEY AUTOINCREMENT,topic TEXT NOT NULL UNIQUE,category TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
 ).run();

 await addMissingColumns(DB, "auto_topics", [["topic_en", "TEXT"]]);

 await DB.prepare(
  "CREATE TABLE IF NOT EXISTS auto_runs (id INTEGER PRIMARY KEY AUTOINCREMENT,slot_key TEXT NOT NULL UNIQUE,status TEXT NOT NULL,post_id INTEGER,topic TEXT,message TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
 ).run();

 await DB.prepare(
  "CREATE TABLE IF NOT EXISTS fallback_images (id INTEGER PRIMARY KEY AUTOINCREMENT,url TEXT NOT NULL,author TEXT,license TEXT,source TEXT DEFAULT 'Wikimedia Commons',page_url TEXT,last_used_at TEXT)"
 ).run();

 await DB.prepare(
  "CREATE TABLE IF NOT EXISTS image_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,post_id INTEGER,topic TEXT,topic_en TEXT,candidates_found INTEGER,chosen_url TEXT,fallback_used INTEGER DEFAULT 0,duration_ms INTEGER,error TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
 ).run();

 autoReady = true;
}


/* ---------- التوقيت (بتوقيت القاهرة) ---------- */

function cairoParts(date) {
 return Object.fromEntries(
  new Intl.DateTimeFormat("en-GB", {
   timeZone: "Africa/Cairo",
   hour: "2-digit",
   minute: "2-digit",
   year: "numeric",
   month: "2-digit",
   day: "2-digit",
   hourCycle: "h23"
  }).formatToParts(date).map(x => [x.type, x.value])
 );
}

function cairoSlot(date) {
 const p = cairoParts(date);
 return {
  hour: +p.hour,
  minute: +p.minute,
  key: `${p.year}-${p.month}-${p.day}-${p.hour}`
 };
}

function nextCairoRun(now = new Date(), hours = DEFAULT_HOURS) {
 if (!hours.length) return null;

 const p = cairoParts(now);
 const h = +p.hour;
 const m = +p.minute;

 /* فرق التوقيت الفعلي للقاهرة (يراعي التوقيت الصيفي) */
 const wholeMinute = now.getTime() - (now.getTime() % 60000);
 const offset = Math.round(
  (Date.UTC(+p.year, +p.month - 1, +p.day, h, m) - wholeMinute) / 3600000
 );

 let next = hours.find(x => x > h || (x === h && m < 1));
 let day = 0;

 if (next === undefined) {
  next = hours[0];
  day = 1;
 }

 return new Date(
  Date.UTC(+p.year, +p.month - 1, +p.day + day, next - offset, 0)
 ).toISOString();
}

/* مواعيد النشر المحفوظة (ساعات بتوقيت القاهرة) */
async function getHours(env) {
 await ensureAutoSchema(env.DB);

 const s = await env.DB.prepare(
  "SELECT value FROM auto_settings WHERE key='hours'"
 ).first();

 const list = String(s?.value ?? "")
  .split(",")
  .map(x => x.trim())
  .filter(x => x !== "")
  .map(Number)
  .filter(n => Number.isInteger(n) && n >= 0 && n <= 23);

 return [...new Set(list)].sort((a, b) => a - b);
}

/* ---------- توليد المحتوى عبر Gemini ---------- */

async function generateAutoContent(env, topic, category) {
 if (!env.GEMINI_API_KEY) {
  throw Error("GEMINI_API_KEY غير مضبوط");
 }

 const prompt = `اكتب منشور معلومات قصيراً لصفحة أقوال عن: ${topic}.
التصنيف: ${category}.

الشروط:
- من 40 إلى 80 كلمة فقط.
- معلومة واحدة محددة ومفيدة.
- عنوان قصير وجذاب.
- شرح مباشر بلغة عربية سهلة.
- دون مقدمات إنشائية أو حشو أو تكرار.
- لا تختلق أرقاماً أو تواريخ أو اقتباسات.
- اختم بوسمين مناسبين كحد أقصى.
- أخرج المنشور فقط.`;

 const r = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  (env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL) + ":generateContent",
  {
   method: "POST",
   headers: {
    "Content-Type": "application/json",
    "x-goog-api-key": env.GEMINI_API_KEY
   },
   body: JSON.stringify({
    systemInstruction: {
     parts: [{
      text: "أنت محرر معلوماتي دقيق. الأولوية لصحة المعلومة واختصارها."
     }]
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
     temperature: 0.35,
     maxOutputTokens: 350
    }
   })
  }
 );

 const d = await r.json();

 if (!r.ok) {
  throw Error(d.error?.message || "فشل Gemini");
 }

 const result = (d.candidates?.[0]?.content?.parts || [])
  .map(x => x.text || "")
  .join("")
  .trim();

 if (!result) throw Error("Gemini لم يرجع محتوى");

 return result;
}

/* ---------- البحث عن صورة مرتبطة بالموضوع ---------- */

/* مهم: ويكيميديا تطلب User-Agent حقيقياً — ضع بريدك الفعلي هنا */
const WIKI_UA = "AqwalBot/1.0 (https://github.com/mselnashar/Autopost; aqwal-bot@example.com)";
const OK_LICENSES = [
 "public domain", "cc0",
 "cc by 2.0", "cc by 3.0", "cc by 4.0",
 "cc by-sa 2.0", "cc by-sa 3.0", "cc by-sa 4.0"
];
const MIN_IMG_W = 800;
const MIN_IMG_H = 450;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cleanHtml = v => String(v || "").replace(/<[^>]*>/g, "").trim();

/* عنوان تقريبي للبحث من أول سطر في النص */
function topicFromContent(content) {
 const line = String(content || "")
  .split("\n")
  .map(x => x.replace(/[*#_>`]/g, "").trim())
  .find(Boolean) || "";
 return line.slice(0, 100);
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
  const r = await fetch(
   "https://generativelanguage.googleapis.com/v1beta/models/" +
   (env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL) + ":generateContent",
   {
    method: "POST",
    headers: {
     "Content-Type": "application/json",
     "x-goog-api-key": env.GEMINI_API_KEY
    },
    body: JSON.stringify({
     contents: [{
      role: "user",
      parts: [{
       text: context
        ? "Read this Arabic text and return only a short English Wikimedia Commons image search phrase (2-5 words) for its main subject (a person, place, or object):\n\n" + context.slice(0, 600)
        : "Translate this Arabic topic to a short English search phrase (2-5 words), return only the phrase: " + topic
      }]
     }],
     generationConfig: { temperature: 0, maxOutputTokens: 100 }
    })
   }
  );

  if (!r.ok) return "";

  const d = await r.json();
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
 api.searchParams.set("gsrsearch", query);
 api.searchParams.set("gsrnamespace", "6");
 api.searchParams.set("gsrlimit", "10");
 api.searchParams.set("prop", "imageinfo");
 api.searchParams.set("iiprop", "url|extmetadata|size|mime");
 api.searchParams.set("iiurlwidth", "1200");
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

   if (!OK_LICENSES.some(l => license.toLowerCase().includes(l))) return null;

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
  const queries = [...new Set([topicEn, topic].filter(Boolean))];

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

/* ---------- النشر على فيسبوك ---------- */

async function uploadPhoto(env, message, image) {
 const response = await fetch(image.url, {
  headers: { "User-Agent": WIKI_UA }
 });

 if (!response.ok) {
  throw Error("تعذر تحميل الصورة (" + response.status + ")");
 }

 const blob = await response.blob();

 if (!blob.type.startsWith("image/")) {
  throw Error("الملف الذي تم تحميله ليس صورة");
 }

 if (blob.size > 8 * 1024 * 1024) {
  throw Error("حجم الصورة أكبر من الحد المسموح");
 }

 const attribution =
  "\n\nمصدر الصورة: " + image.page +
  (image.author ? "\nصاحب الصورة: " + image.author : "") +
  (image.license ? "\nالترخيص: " + image.license : "");

 const form = new FormData();

 form.set("source", blob, "aqwal-image." + (blob.type === "image/png" ? "png" : "jpg"));
 form.set("caption", message + attribution);
 form.set("access_token", env.PAGE_ACCESS_TOKEN);

 const result = await fetch(
  `https://graph.facebook.com/${GRAPH_VERSION}/${pageId(env)}/photos`,
  { method: "POST", body: form }
 );

 const data = await result.json();

 if (!result.ok || !data.id) {
  throw Error(data.error?.message || "فشل نشر الصورة على Facebook");
 }

 return data.post_id || data.id;
}

/* محاولتان: الثانية بعد 5 ثوانٍ */
async function publishPhotoToFacebook(env, message, image) {
 if (!env.PAGE_ACCESS_TOKEN) {
  throw Error("PAGE_ACCESS_TOKEN غير مضبوط");
 }

 try {
  return await uploadPhoto(env, message, image);
 } catch (e) {
  console.log("Photo attempt 1 failed:", e.message);
  await sleep(5000);
  return await uploadPhoto(env, message, image);
 }
}

async function publishToFacebook(env, message) {
 if (!env.PAGE_ACCESS_TOKEN) {
  throw Error("PAGE_ACCESS_TOKEN غير مضبوط");
 }

 const u = new URL(
  `https://graph.facebook.com/${GRAPH_VERSION}/${pageId(env)}/feed`
 );

 u.searchParams.set("message", message);
 u.searchParams.set("access_token", env.PAGE_ACCESS_TOKEN);

 const r = await fetch(u, { method: "POST" });
 const d = await r.json();

 if (!r.ok || !d.id) {
  throw Error(d.error?.message || "فشل النشر على Facebook");
 }

 return d.id;
}

/* نشر بالصورة. إذا كان require_image مفعّلاً لا يُنشر نص بلا صورة أبداً */
async function publishPost(env, content, image) {
 const mustHaveImage = await requireImage(env);

 if (!image?.url) {
  if (mustHaveImage) throw Error("لا توجد صورة للمنشور — تم إلغاء النشر (require_image)");
  return publishToFacebook(env, content);
 }

 try {
  return await publishPhotoToFacebook(env, content, image);
 } catch (e) {
  if (mustHaveImage) throw e;
  console.log("Photo publish failed, fallback to text:", e.message);
  return publishToFacebook(env, content);
 }
}


/* ---------- القصص والريلز ---------- */

const MAX_REEL_BYTES = 60 * 1024 * 1024;

/* القصص لا تدعم نصاً مرافقاً، فلا نستخدم تلقائياً إلا صوراً لا تشترط ذكر المصدر */
const isCreditFree = license => /public domain|cc0/i.test(license || "");

async function autoStoryEnabled(env) {
 await ensureAutoSchema(env.DB);
 const s = await env.DB.prepare(
  "SELECT value FROM auto_settings WHERE key='auto_story'"
 ).first();
 return s?.value === "1";
}

async function publishStoryBlob(env, blob) {
 if (!env.PAGE_ACCESS_TOKEN) throw Error("PAGE_ACCESS_TOKEN غير مضبوط");

 /* الصورة تُرفع غير منشورة ثم تُنشر كقصة (يجب ألا تكون مستخدمة في منشور) */
 const form = new FormData();
 form.set("source", blob, "story.jpg");
 form.set("published", "false");
 form.set("access_token", env.PAGE_ACCESS_TOKEN);

 const up = await fetch(
  `https://graph.facebook.com/${GRAPH_VERSION}/${pageId(env)}/photos`,
  { method: "POST", body: form }
 );
 const ud = await up.json();

 if (!up.ok || !ud.id) {
  throw Error(ud.error?.message || "فشل رفع صورة القصة");
 }

 const st = await fetch(
  `https://graph.facebook.com/${GRAPH_VERSION}/${pageId(env)}/photo_stories`,
  {
   method: "POST",
   body: new URLSearchParams({
    photo_id: ud.id,
    access_token: env.PAGE_ACCESS_TOKEN
   })
  }
 );
 const sd = await st.json();

 if (!st.ok || !sd.success) {
  throw Error(sd.error?.message || "فشل نشر القصة");
 }

 return String(sd.post_id || ud.id);
}

async function publishStoryFromUrl(env, imageUrl) {
 const r = await fetch(imageUrl, { headers: { "User-Agent": WIKI_UA } });

 if (!r.ok) throw Error("تعذر تحميل صورة القصة");

 const blob = await r.blob();

 if (!blob.type.startsWith("image/") || blob.size > 8 * 1024 * 1024) {
  throw Error("صورة القصة غير صالحة");
 }

 return publishStoryBlob(env, blob);
}

async function publishReel(env, bytes, description) {
 if (!env.PAGE_ACCESS_TOKEN) throw Error("PAGE_ACCESS_TOKEN غير مضبوط");

 const token = env.PAGE_ACCESS_TOKEN;
 const base = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId(env)}/video_reels`;

 /* 1) بدء جلسة الرفع */
 const start = await fetch(base, {
  method: "POST",
  body: new URLSearchParams({ upload_phase: "start", access_token: token })
 });
 const sd = await start.json();

 if (!start.ok || !sd.video_id) {
  throw Error(sd.error?.message || "تعذر بدء رفع الريلز");
 }

 /* 2) رفع الفيديو (الخادم هنا rupload وليس graph) */
 const up = await fetch(
  sd.upload_url || `https://rupload.facebook.com/video-upload/${sd.video_id}`,
  {
   method: "POST",
   headers: {
    Authorization: "OAuth " + token,
    offset: "0",
    file_size: String(bytes.byteLength)
   },
   body: bytes
  }
 );
 const ud = await up.json().catch(() => ({}));

 if (!up.ok || ud.success === false) {
  throw Error(ud.debug_info?.message || ud.error?.message || "فشل رفع الفيديو");
 }

 /* 3) النشر */
 const fin = await fetch(base, {
  method: "POST",
  body: new URLSearchParams({
   upload_phase: "finish",
   video_id: sd.video_id,
   video_state: "PUBLISHED",
   description,
   access_token: token
  })
 });
 const fd = await fin.json();

 if (!fin.ok || fd.success === false) {
  throw Error(fd.error?.message || "فشل نشر الريلز");
 }

 return sd.video_id;
}

/* ---------- تشغيل النشر التلقائي ---------- */

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

  const pool = TOPICS.filter(x => !used.has(x[1]));

  const choice = (pool.length ? pool : TOPICS)[
   Math.floor(Math.random() * (pool.length || TOPICS.length))
  ];

  [category, topic] = choice;

  /* الصورة أولاً: إن لم توجد وكان require_image مفعّلاً يتوقف التشغيل ويُسجَّل السبب */
  let image = null;
  try {
   image = await findTopicImage(env, topic);
  } catch (e) {
   if (await requireImage(env)) throw e;
   console.log("Image search:", e.message);
  }

  /* إنشاء المحتوى */
  const content = await generateAutoContent(env, topic, category);

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
  ).bind(postId, topic, "تم النشر: " + fbId + storyNote, slot.key).run();
 } catch (e) {
  const msg = String(e.message || e).slice(0, 900);

  await env.DB.prepare(
   "INSERT INTO publish_logs (post_id,result,message) VALUES (?,'failed',?)"
  ).bind(postId, msg).run();

  await env.DB.prepare(
   "UPDATE auto_runs SET status='failed',post_id=?,topic=?,message=? WHERE slot_key=?"
  ).bind(postId, topic, msg, slot.key).run();

  throw e;
 }
}


/* واجهة الموقع */

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#302052">
<title>أقوال | إدارة المحتوى</title>
<style>
:root{--p:#6845a3;--d:#302052;--bg:#f6f3fb;--t:#29243b;--m:#7d7790;--b:#e8e3f0;--ok:#176c3d;--err:#a32d42}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--t);font:16px/1.7 Tahoma,Arial,sans-serif}
button,input,textarea,select{font:inherit}
button{cursor:pointer;border:0;border-radius:10px;padding:10px 14px}
button:disabled{opacity:.5;cursor:default}
.wrap{max-width:760px;margin:auto;padding:0 12px}
.top{background:linear-gradient(135deg,#302052,#67439c);color:#fff;padding:14px 0}
.top .wrap{display:flex;justify-content:space-between;align-items:center;gap:10px}
.brand{font-size:22px;font-weight:bold}
.conn{font-size:12px;background:rgba(255,255,255,.18);padding:4px 10px;border-radius:20px}
.login{display:flex;gap:8px;padding:12px 0}
.login input{flex:1}
.tabs{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--b)}
.tabs .wrap{display:grid;grid-template-columns:repeat(6,1fr);gap:2px;padding:6px 4px}
.tabs button{background:none;color:var(--m);padding:8px 2px;font-size:13px}
.tabs button.active{background:#f0ecf6;color:var(--d);font-weight:bold}
.tab{display:none;padding:14px 0 40px}
.tab.active{display:block}
.card{background:#fff;border:1px solid var(--b);border-radius:16px;padding:16px;margin-bottom:12px}
.card h2{font-size:17px;margin:0 0 4px}
.muted{font-size:13px;color:var(--m);margin:2px 0 10px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.stat{background:#f8f6fb;border:1px solid var(--b);border-radius:12px;padding:10px;text-align:center;font-size:13px;color:var(--m)}
.stat strong{display:block;font-size:24px;color:var(--d)}
label{display:block;font-size:13px;font-weight:bold;margin:12px 0 4px}
input,textarea,select{width:100%;padding:11px;border:1px solid #ddd7e8;border-radius:10px;background:#fff;color:var(--t)}
textarea{min-height:260px;line-height:1.9}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.primary{background:var(--p);color:#fff}
.secondary{background:#f0ecf6;color:var(--d)}
.danger{background:#fdecee;color:var(--err)}
.block{width:100%}
.status{padding:9px 12px;background:#f2edf9;border-radius:10px;margin:10px 0 0;font-size:14px;white-space:pre-wrap}
.status.ok{background:#eaf7ef;color:var(--ok)}
.status.err{background:#fff0f1;color:var(--err)}
.status:empty{display:none}
.hours{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0}
.hours button{background:#f4f1f8;color:var(--m);padding:9px 2px;font-size:14px}
.hours button.on{background:var(--p);color:#fff}
.post{border:1px solid var(--b);border-radius:12px;padding:12px;margin-top:10px}
.post img{width:100%;max-height:190px;object-fit:cover;border-radius:10px;margin:8px 0}
.post p{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.switch{display:flex;align-items:center;gap:10px;margin-top:12px}
.switch input{width:auto}
details summary{cursor:pointer;color:var(--p);font-size:14px;margin-top:12px}
.log{font-size:13px;border-bottom:1px solid var(--b);padding:8px 0;white-space:pre-wrap}
#storyCanvas{display:block;width:100%;max-width:280px;margin:12px auto;border-radius:12px;background:#302052}
#imageTestPreview{display:none;width:100%;border-radius:12px;margin-top:10px}
</style>
</head>
<body>

<header class="top"><div class="wrap">
<div class="brand">أقوال</div>
<div id="connection" class="conn">غير متصل</div>
</div></header>

<div class="wrap">
<div class="login">
<input id="admin" type="password" placeholder="مفتاح الإدارة" autocomplete="current-password">
<button class="primary" onclick="refreshAll()">دخول</button>
</div>
</div>

<nav class="tabs"><div class="wrap">
<button data-tab="home" class="active" onclick="showTab('home')">الرئيسية</button>
<button data-tab="create" onclick="showTab('create')">إنشاء</button>
<button data-tab="drafts" onclick="showTab('drafts')">المسودات</button>
<button data-tab="stories" onclick="showTab('stories')">القصص</button>
<button data-tab="reels" onclick="showTab('reels')">الريلز</button>
<button data-tab="settings" onclick="showTab('settings')">الإعدادات</button>
</div></nav>

<main class="wrap">

<section id="tab-home" class="tab active">
<div class="card">
<div class="stats">
<div class="stat"><strong id="total">—</strong>المنشورات</div>
<div class="stat"><strong id="draftCount">—</strong>المسودات</div>
<div class="stat"><strong id="publishedCount">—</strong>المنشورة</div>
</div>
</div>

<div class="card">
<h2>النشر التلقائي</h2>
<div id="autoStatus" class="status">أدخل مفتاح الإدارة للبدء</div>
<p id="nextRun" class="muted"></p>
<button id="autoToggle" class="primary block" onclick="toggleAuto()">تفعيل النشر التلقائي</button>
<details><summary>آخر المحاولات</summary><div id="autoLogs">—</div></details>
</div>
</section>

<section id="tab-create" class="tab">
<div class="card">
<h2>إنشاء بالذكاء الاصطناعي</h2>
<label>الموضوع</label>
<input id="topic" placeholder="مثال: ابن الهيثم">
<label>التصنيف</label>
<select id="category">
<option>تاريخ مصر</option><option>التاريخ العربي</option>
<option>التاريخ العالمي</option><option>شخصيات مؤثرة</option>
<option>ثقافة وعلوم</option><option>قصص إنسانية</option>
<option>ألغاز تاريخية</option><option>أقوال وحكم</option>
</select>
<details><summary>خيارات إضافية</summary>
<label>الحجم</label>
<select id="length">
<option>100 إلى 150 كلمة</option>
<option>200 إلى 300 كلمة</option>
<option selected>400 إلى 600 كلمة</option>
<option>600 إلى 800 كلمة</option>
</select>
<label>تعليمات إضافية</label>
<input id="extra" placeholder="اختياري">
</details>
<button id="generateBtn" class="primary block" style="margin-top:14px" onclick="generate()">إنشاء المحتوى</button>
<div id="aiStatus" class="status"></div>
</div>

<div class="card">
<h2>المنشور</h2>
<textarea id="message" placeholder="اكتب أو أنشئ منشوراً..."></textarea>
<p id="wordCount" class="muted">0 كلمة</p>
<div class="row">
<button class="secondary" onclick="saveDraft()">حفظ مسودة</button>
<button class="primary" onclick="publishText()">نشر الآن</button>
<button class="secondary" onclick="copyText()">نسخ</button>
<button class="danger" onclick="clearEditor()">مسح</button>
</div>
<div id="publishStatus" class="status"></div>
</div>
</section>

<section id="tab-drafts" class="tab">
<div class="card">
<div style="display:flex;justify-content:space-between;align-items:center">
<h2>المسودات</h2>
<button class="secondary" onclick="loadDrafts()">تحديث</button>
</div>
<div id="drafts">أدخل مفتاح الإدارة ثم اضغط تحديث.</div>
</div>
</section>

<section id="tab-stories" class="tab">
<div class="card">
<h2>قصة بصورة</h2>
<p class="muted">تبقى القصة 24 ساعة. تُرسم الصورة هنا ثم تُرفع كما تراها.</p>
<label>الموضوع</label>
<input id="storyTopic" placeholder="مثال: ابن الهيثم">
<button class="secondary block" style="margin-top:10px" onclick="storyFindImage()">ابحث عن صورة</button>
<label class="switch"><input type="checkbox" id="storyUseText" checked onchange="storyDraw()"> كتابة عنوان على الصورة</label>
<input id="storyTitle" placeholder="العنوان (اختياري)" oninput="storyDraw()">
<canvas id="storyCanvas" width="1080" height="1920"></canvas>
<button id="storyPublishBtn" class="primary block" onclick="storyPublish()" disabled>نشر القصة</button>
<div id="storyStatus" class="status"></div>
</div>

<div class="card">
<h2>قصص تلقائية</h2>
<label class="switch"><input type="checkbox" id="autoStory" onchange="saveAutoStory()"> نشر قصة مع كل منشور تلقائي</label>
<p class="muted">القصص لا تدعم نصاً مرافقاً، لذلك تُنشر تلقائياً فقط الصور التي لا تشترط ذكر المصدر (المجال العام). غير ذلك يُتخطى، ويظهر السبب في آخر المحاولات.</p>
</div>
</section>

<section id="tab-reels" class="tab">
<div class="card">
<h2>نشر ريلز</h2>
<p class="muted">فيديو رأسي 9:16، يفضّل mp4، بدقة 540p فأعلى. الحد الأقصى 60 ميغابايت.</p>
<label>ملف الفيديو</label>
<input id="reelFile" type="file" accept="video/*" onchange="reelPick()">
<div id="reelInfo" class="muted"></div>
<label>الوصف (حتى 800 حرف)</label>
<textarea id="reelCaption" maxlength="800" style="min-height:110px" placeholder="وصف الريلز مع الوسوم"></textarea>
<button id="reelPublishBtn" class="primary block" style="margin-top:12px" onclick="reelPublish()" disabled>نشر الريلز</button>
<div id="reelStatus" class="status"></div>
<button id="reelCheckBtn" class="secondary block" style="display:none;margin-top:8px" onclick="reelCheck()">فحص حالة المعالجة</button>
</div>
</section>

<section id="tab-settings" class="tab">
<div class="card">
<h2>مواعيد النشر التلقائي</h2>
<p class="muted">اختر الساعات (بتوقيت القاهرة). ينشر الموقع منشوراً واحداً عند بداية كل ساعة مختارة.</p>
<div class="row" style="margin-top:0">
<button class="secondary" onclick="setPreset([2,6,10,14,18,22])">6 يومياً</button>
<button class="secondary" onclick="setPreset([8,14,20])">3 يومياً</button>
<button class="secondary" onclick="setPreset([12])">1 يومياً</button>
</div>
<div id="hoursGrid" class="hours"></div>
<p id="hoursSummary" class="muted"></p>
<button class="primary block" onclick="saveHours()">حفظ المواعيد</button>
<div id="hoursStatus" class="status"></div>
</div>

<div class="card">
<h2>الصور</h2>
<label class="switch"><input type="checkbox" id="requireImage" onchange="saveRequireImage()"> عدم النشر بدون صورة</label>
<details><summary>اختبار البحث عن صورة</summary>
<label>الموضوع</label>
<input id="imageTestTopic" value="ابن الهيثم وأثره في المنهج العلمي">
<button class="secondary block" style="margin-top:10px" onclick="testImage()">ابحث</button>
<div id="imageTestResult" class="status"></div>
<img id="imageTestPreview" alt="">
</details>
</div>
</section>

</main>
<script src="https://cdn.jsdelivr.net/gh/mselnashar/Autopost@main/app.js?v=20261110c" defer></script>
</body>
</html>`;

/* واجهات API */

export default {
 async scheduled(event, env, ctx) {
  ctx.waitUntil(runAutomaticPost(env, event.scheduledTime));
 },

 async fetch(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/" && request.method === "GET") {
   return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
   });
  }

  if (!url.pathname.startsWith("/api/")) {
   return new Response("Not Found", { status: 404 });
  }

  if (!env.ADMIN_KEY) {
   return json({ ok: false, error: "ADMIN_KEY غير مضبوط على الخادم" }, 500);
  }

  if (request.headers.get("Authorization") !== "Bearer " + env.ADMIN_KEY) {
   return json({ ok: false, error: "مفتاح الإدارة غير صحيح" }, 401);
  }

  if (!env.DB) {
   return json({ ok: false, error: "قاعدة البيانات DB غير مربوطة" }, 500);
  }

  if (url.pathname === "/api/status" && request.method === "GET") {
   try {
    if (!env.PAGE_ACCESS_TOKEN) throw Error("PAGE_ACCESS_TOKEN غير موجود");

    const u = new URL(
     `https://graph.facebook.com/${GRAPH_VERSION}/${pageId(env)}`
    );

    u.searchParams.set("fields", "id,name");
    u.searchParams.set("access_token", env.PAGE_ACCESS_TOKEN);

    const r = await fetch(u);
    const d = await r.json();

    if (!r.ok) {
     return json({ ok: false, error: d.error?.message || "Facebook API error" }, 400);
    }

    return json({ ok: true, page: d.name, id: d.id });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/stats" && request.method === "GET") {
   try {
    await ensurePostsSchema(env.DB);

    const x = await env.DB.prepare(
     "SELECT COUNT(*) total,SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) drafts,SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published FROM posts"
    ).first();

    return json({
     ok: true,
     total: x?.total || 0,
     drafts: x?.drafts || 0,
     published: x?.published || 0
    });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/auto/status" && request.method === "GET") {
   try {
    await ensureAutoSchema(env.DB);

    const s = await env.DB.prepare(
     "SELECT value FROM auto_settings WHERE key='enabled'"
    ).first();

    const logs = await env.DB.prepare(
     "SELECT status,topic,message,created_at FROM auto_runs ORDER BY id DESC LIMIT 10"
    ).all();

    const hours = await getHours(env);

    return json({
     ok: true,
     enabled: s?.value === "1",
     logs: logs.results || [],
     hours,
     requireImage: await requireImage(env),
     autoStory: await autoStoryEnabled(env),
     nextRun: nextCairoRun(new Date(), hours)
    });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/auto/toggle" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);
    const b = await request.json();
    const v = b.enabled === true ? "1" : "0";

    await env.DB.prepare(
     "UPDATE auto_settings SET value=? WHERE key='enabled'"
    ).bind(v).run();

    return json({ ok: true, enabled: v === "1" });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/generate" && request.method === "POST") {
   try {
    if (!env.GEMINI_API_KEY) throw Error("GEMINI_API_KEY غير موجود");

    const b = await request.json();
    const topic = String(b.topic || "").trim().slice(0, 300);
    const category = String(b.category || "محتوى ثقافي").slice(0, 100);
    const length = String(b.length || "400 إلى 600 كلمة");
    const extra = String(b.extra || "").slice(0, 500);

    if (!topic) return json({ ok: false, error: "اكتب موضوع المنشور" }, 400);

    const prompt = `اكتب مقالاً عربياً لصفحة أقوال. الموضوع: ${topic}. التصنيف: ${category}. الطول: ${length}. تعليمات: ${extra || "لا توجد"}. ابدأ بعنوان جذاب ومقدمة مشوقة وسرد مترابط وخاتمة تفاعلية. لا تختلق تواريخ أو اقتباسات أو مصادر. استخدم العربية الفصحى المبسطة وأخرج المقال فقط.`;

    const r = await fetch(
     "https://generativelanguage.googleapis.com/v1beta/models/" +
     (env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL) + ":generateContent",
     {
      method: "POST",
      headers: {
       "Content-Type": "application/json",
       "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify({
       systemInstruction: {
        parts: [{ text: "أنت محرر تاريخي وثقافي محترف والدقة أهم من الإثارة." }]
       },
       contents: [{ role: "user", parts: [{ text: prompt }] }],
       generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 2500
       }
      })
     }
    );

    const d = await r.json();

    if (!r.ok) throw Error(d.error?.message || "فشل Gemini");

    const content = (d.candidates?.[0]?.content?.parts || [])
     .map(x => x.text || "").join("").trim();

    if (!content) throw Error("لم يرجع Gemini نصاً");

    await ensurePostsSchema(env.DB);

    const saved = await env.DB.prepare(
     "INSERT INTO posts (content,post_type,status) VALUES (?,?,'draft')"
    ).bind(content, category).run();

    const id = saved.meta.last_row_id;
    let image = null;
    let imageError = null;

    try {
     image = await findTopicImage(env, topic, { postId: id });
     await saveImageToPost(env, id, image);
    } catch (e) {
     imageError = e.message;
    }

    return json({ ok: true, id, content, image, imageError });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/save-draft" && request.method === "POST") {
   try {
    const b = await request.json();
    const content = String(b.content || "").trim();
    const category = String(b.category || "محتوى");
    const explicit = String(b.topic || "").trim().slice(0, 300);
    const topic = explicit || topicFromContent(content);
    const context = explicit ? "" : content;

    if (!content) return json({ ok: false, error: "المحتوى فارغ" }, 400);

    await ensurePostsSchema(env.DB);

    const x = await env.DB.prepare(
     "INSERT INTO posts (content,post_type,status) VALUES (?,?,'draft')"
    ).bind(content, category).run();

    const id = x.meta.last_row_id;
    let image = null;
    let imageError = null;

    try {
     image = await findTopicImage(env, topic, { postId: id, context });
     await saveImageToPost(env, id, image);
    } catch (e) {
     imageError = e.message;
    }

    return json({ ok: true, id, image, imageError });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/test-image" && request.method === "POST") {
   try {
    const body = await request.json();
    const topic = String(body.topic || "").trim();

    if (!topic) {
     return json({ ok: false, error: "اكتب موضوع البحث" }, 400);
    }

    const image = await findTopicImage(env, topic);

    return json({ ok: true, topic, image });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/drafts" && request.method === "GET") {
   try {
    await ensurePostsSchema(env.DB);

    const x = await env.DB.prepare(
     "SELECT id,content,post_type,created_at,image_url,image_page,image_author,image_license FROM posts WHERE status='draft' ORDER BY id DESC LIMIT 50"
    ).all();

    return json({ ok: true, items: x.results || [] });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/delete-draft" && request.method === "POST") {
   try {
    const id = Number((await request.json()).id);

    if (!Number.isInteger(id) || id < 1) {
     return json({ ok: false, error: "رقم المسودة غير صحيح" }, 400);
    }

    const x = await env.DB.prepare(
     "DELETE FROM posts WHERE id=? AND status='draft'"
    ).bind(id).run();

    if (!x.meta.changes) {
     return json({ ok: false, error: "المسودة غير موجودة" }, 404);
    }

    return json({ ok: true });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/publish-draft" && request.method === "POST") {
   let id = 0;
   let claimed = false;

   try {
    id = Number((await request.json()).id);

    await ensureAutoSchema(env.DB);

    /* حجز المسودة ذرياً لمنع النشر المزدوج */
    const claim = await env.DB.prepare(
     "UPDATE posts SET status='publishing' WHERE id=? AND status='draft'"
    ).bind(id).run();

    if (!claim.meta.changes) {
     return json({ ok: false, error: "المسودة غير موجودة أو سبق نشرها" }, 404);
    }

    claimed = true;

    const p = await env.DB.prepare(
     "SELECT id,content,image_url,image_page,image_author,image_license FROM posts WHERE id=?"
    ).bind(id).first();

    let image = p.image_url
     ? { url: p.image_url, page: p.image_page, author: p.image_author, license: p.image_license }
     : null;

    /* لا بحث جديد إن كانت الصورة محفوظة */
    if (!image) {
     try {
      image = await findTopicImage(env, topicFromContent(p.content), { postId: id, context: p.content });
      await saveImageToPost(env, id, image);
     } catch (e) {
      if (await requireImage(env)) throw e;
     }
    }

    const fb = await publishPost(env, p.content, image);

    await env.DB.prepare(
     "UPDATE posts SET status='published',facebook_post_id=?,published_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(fb, id).run();

    await env.DB.prepare(
     "INSERT INTO publish_logs (post_id,result,message,fb_post_id,image_url) VALUES (?,'success',?,?,?)"
    ).bind(id, fb, fb, image?.url || null).run();

    return json({ ok: true, id: fb });
   } catch (e) {
    if (claimed) {
     await env.DB.prepare(
      "UPDATE posts SET status='draft' WHERE id=? AND status='publishing'"
     ).bind(id).run();

     await env.DB.prepare(
      "INSERT INTO publish_logs (post_id,result,message) VALUES (?,'failed',?)"
     ).bind(id, String(e.message || e).slice(0, 900)).run();
    }

    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/publish" && request.method === "POST") {
   try {
    const b = await request.json();
    const message = String(b.message || "").trim();
    const explicit = String(b.topic || "").trim().slice(0, 300);
    const topic = explicit || topicFromContent(message);
    const context = explicit ? "" : message;

    if (!message) return json({ ok: false, error: "نص المنشور فارغ" }, 400);

    await ensureAutoSchema(env.DB);

    let image = null;
    try {
     image = await findTopicImage(env, topic, { context });
    } catch (e) {
     if (await requireImage(env)) throw e;
    }

    const fb = await publishPost(env, message, image);

    await env.DB.prepare(
     "INSERT INTO posts (content,status,facebook_post_id,published_at,image_url,image_page,image_author,image_license) VALUES (?,'published',?,CURRENT_TIMESTAMP,?,?,?,?)"
    ).bind(
     message, fb,
     image?.url || null, image?.page || null,
     image?.author || null, image?.license || null
    ).run();

    await env.DB.prepare(
     "INSERT INTO publish_logs (result,message,fb_post_id,image_url) VALUES ('success',?,?,?)"
    ).bind(fb, fb, image?.url || null).run();

    return json({ ok: true, id: fb });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/image-proxy" && request.method === "GET") {
   try {
    const u = new URL(url.searchParams.get("url") || "");

    if (u.protocol !== "https:" || u.hostname !== "upload.wikimedia.org") {
     return json({ ok: false, error: "مصدر الصورة غير مسموح" }, 400);
    }

    const r = await fetch(u, { headers: { "User-Agent": WIKI_UA } });

    if (!r.ok) return json({ ok: false, error: "تعذر تحميل الصورة" }, 502);

    return new Response(r.body, {
     headers: { "Content-Type": r.headers.get("Content-Type") || "image/jpeg" }
    });
   } catch (e) {
    return json({ ok: false, error: "رابط غير صالح" }, 400);
   }
  }

  if (url.pathname === "/api/story/publish" && request.method === "POST") {
   try {
    const bytes = await request.arrayBuffer();

    if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) {
     return json({ ok: false, error: "حجم الصورة غير صالح" }, 400);
    }

    const id = await publishStoryBlob(
     env, new Blob([bytes], { type: "image/jpeg" })
    );

    await ensurePublishLogsSchema(env.DB);
    await env.DB.prepare(
     "INSERT INTO publish_logs (result,message,fb_post_id) VALUES ('story',?,?)"
    ).bind(id, id).run();

    return json({ ok: true, id });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/reel/publish" && request.method === "POST") {
   try {
    const declared = Number(request.headers.get("content-length") || 0);

    if (declared > MAX_REEL_BYTES) {
     return json({ ok: false, error: "حجم الفيديو أكبر من 60 ميغابايت" }, 413);
    }

    const bytes = await request.arrayBuffer();

    if (!bytes.byteLength || bytes.byteLength > MAX_REEL_BYTES) {
     return json({ ok: false, error: "حجم الفيديو غير صالح" }, 400);
    }

    let description = "";
    try {
     description = decodeURIComponent(request.headers.get("x-description") || "");
    } catch (e) {}

    const videoId = await publishReel(env, bytes, description.slice(0, 800));

    await ensurePublishLogsSchema(env.DB);
    await env.DB.prepare(
     "INSERT INTO publish_logs (result,message,fb_post_id) VALUES ('reel',?,?)"
    ).bind(videoId, videoId).run();

    return json({ ok: true, video_id: videoId });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/reel/status" && request.method === "GET") {
   try {
    const id = (url.searchParams.get("id") || "").replace(/\D/g, "");

    if (!id) return json({ ok: false, error: "رقم الفيديو مطلوب" }, 400);

    const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${id}`);
    u.searchParams.set("fields", "status");
    u.searchParams.set("access_token", env.PAGE_ACCESS_TOKEN);

    const r = await fetch(u);
    const d = await r.json();

    if (!r.ok) {
     return json({ ok: false, error: d.error?.message || "تعذر فحص الحالة" }, 400);
    }

    return json({ ok: true, status: d.status || null });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/settings/auto-story" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);
    const v = (await request.json()).enabled === true ? "1" : "0";

    await env.DB.prepare(
     "UPDATE auto_settings SET value=? WHERE key='auto_story'"
    ).bind(v).run();

    return json({ ok: true, auto_story: v === "1" });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/auto/hours" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);

    const b = await request.json();
    const list = [...new Set(
     (Array.isArray(b.hours) ? b.hours : []).map(Number)
      .filter(n => Number.isInteger(n) && n >= 0 && n <= 23)
    )].sort((a, c) => a - c);

    if (!list.length) {
     return json({ ok: false, error: "اختر ساعة واحدة على الأقل" }, 400);
    }

    await env.DB.prepare(
     "UPDATE auto_settings SET value=? WHERE key='hours'"
    ).bind(list.join(",")).run();

    return json({ ok: true, hours: list, nextRun: nextCairoRun(new Date(), list) });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  const preview = url.pathname.match(/^\/api\/posts\/(\d+)\/image-preview$/);

  if (preview && request.method === "GET") {
   try {
    await ensurePostsSchema(env.DB);

    const p = await env.DB.prepare(
     "SELECT id,image_url,image_page,image_author,image_license FROM posts WHERE id=?"
    ).bind(Number(preview[1])).first();

    if (!p) return json({ ok: false, error: "المنشور غير موجود" }, 404);

    return json({
     ok: true,
     image: p.image_url
      ? { url: p.image_url, page: p.image_page, author: p.image_author, license: p.image_license }
      : null
    });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/regenerate-image" && request.method === "POST") {
   try {
    const b = await request.json();
    const id = Number(b.id);

    await ensurePostsSchema(env.DB);

    const p = await env.DB.prepare(
     "SELECT id,content,status,image_url FROM posts WHERE id=?"
    ).bind(id).first();

    if (!p || p.status !== "draft") {
     return json({ ok: false, error: "المسودة غير موجودة أو سبق نشرها" }, 404);
    }

    const explicit = String(b.topic || "").trim().slice(0, 300);
    const topic = explicit || topicFromContent(p.content);

    const image = await findTopicImage(env, topic, {
     postId: id,
     context: explicit ? "" : p.content,
     skip: p.image_url ? [p.image_url] : []
    });

    await saveImageToPost(env, id, image);

    return json({ ok: true, image });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/settings/require-image" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);
    const v = (await request.json()).enabled === false ? "0" : "1";

    await env.DB.prepare(
     "UPDATE auto_settings SET value=? WHERE key='require_image'"
    ).bind(v).run();

    return json({ ok: true, require_image: v === "1" });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  return new Response("Not Found", { status: 404 });
 }
};
