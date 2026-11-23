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
/* نموذج بديل عند ازدحام الأساسي — يمكن تغييره بالمتغير GEMINI_FALLBACK_MODEL */
const DEFAULT_FALLBACK_MODEL = "gemini-2.5-flash";

/* استدعاء Gemini مع إعادة المحاولة عند الازدحام ثم الانتقال لنموذج بديل */
async function callGemini(env, body, { attempts = 3 } = {}) {
 if (!env.GEMINI_API_KEY) throw Error("GEMINI_API_KEY غير مضبوط");

 const models = [...new Set([
  env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL
 ])];

 const errors = [];

 for (const model of models) {
  let last = "فشل Gemini";

  for (let i = 0; i < attempts; i++) {
   if (i) await sleep(i * 3000);   /* 3 ثوانٍ ثم 6 */

   try {
    const r = await fetch(
     `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
     {
      method: "POST",
      headers: {
       "Content-Type": "application/json",
       "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify(body)
     }
    );
    const d = await r.json().catch(() => ({}));

    if (r.ok) return d;

    last = d.error?.message || ("HTTP " + r.status);

    const busy = [429, 500, 502, 503, 504].includes(r.status) ||
     /high demand|overloaded|unavailable|try again/i.test(last);

    if (!busy) break;   /* خطأ دائم لهذا النموذج: انتقل للتالي */
   } catch (e) {
    last = String(e.message || e);
   }
  }

  errors.push(model + ": " + last.slice(0, 160));
 }

 throw Error(errors.join(" — "));
}
const DEFAULT_HOURS = [2, 6, 10, 14, 18, 22];

const TOPICS = [
 // تاريخ مصر
 ["تاريخ مصر", "كيف كانت الحياة في مدينة الفسطاط؟"],
 ["تاريخ مصر", "أسرار بناء معابد أبو سمبل"],
 ["تاريخ مصر", "كيف كان المصريون القدماء يعالجون الأمراض؟"],
 ["تاريخ مصر", "قصة مقياس النيل وأهميته"],
 ["تاريخ مصر", "رحلة نقل معابد النوبة لإنقاذها"],

 // التاريخ العربي والإسلامي
 ["التاريخ العربي", "كيف نشأت مدينة بغداد المدورة؟"],
 ["التاريخ العربي", "قصة تأسيس جامعة القرويين"],
 ["التاريخ العربي", "الزراعة والري في الحضارة الإسلامية"],
 ["التاريخ العربي", "البريد والاتصالات في العصر العباسي"],
 ["التاريخ العربي", "كيف ازدهرت التجارة على طريق الحرير؟"],

 // التاريخ العالمي
 ["التاريخ العالمي", "كيف كانت الحياة في روما القديمة؟"],
 ["التاريخ العالمي", "قصة سقوط جدار برلين"],
 ["التاريخ العالمي", "كيف غيّر الطاعون الأسود أوروبا؟"],
 ["التاريخ العالمي", "قصة أول رحلة ناجحة حول العالم"],
 ["التاريخ العالمي", "كيف نشأت الألعاب الأولمبية القديمة؟"],

 // شخصيات مؤثرة
 ["شخصيات مؤثرة", "عباس بن فرناس ومحاولات الطيران"],
 ["شخصيات مؤثرة", "الخنساء ومكانتها في الشعر العربي"],
 ["شخصيات مؤثرة", "ابن النفيس واكتشاف الدورة الدموية الصغرى"],
 ["شخصيات مؤثرة", "نيكولا تسلا وأفكاره التي سبقت عصره"],
 ["شخصيات مؤثرة", "أحمد زويل ورحلة اكتشاف الفيمتو ثانية"],

 // ألغاز واكتشافات
 ["ألغاز واكتشافات", "لماذا اختفى شعب المايا من مدنه الكبرى؟"],
 ["ألغاز واكتشافات", "سر آلية أنتيكيثيرا القديمة"],
 ["ألغاز واكتشافات", "كيف اكتُشفت مدينة ماتشو بيتشو؟"],
 ["ألغاز واكتشافات", "الرسائل الغامضة في مخطوطة فوينيتش"],
 ["ألغاز واكتشافات", "أسرار خطوط نازكا في صحراء بيرو"],

 // العلوم والتكنولوجيا
 ["الثقافة والعلوم", "كيف اخترع الإنسان الساعة الميكانيكية؟"],
 ["الثقافة والعلوم", "لماذا يطفو الجليد فوق الماء؟"],
 ["الثقافة والعلوم", "كيف تنتقل المعلومات عبر الإنترنت؟"],
 ["الثقافة والعلوم", "كيف تعمل البوصلة المغناطيسية؟"],
 ["الثقافة والعلوم", "لماذا تختلف بصمات الأصابع بين البشر؟"],

 // الطبيعة والكون
 ["الطبيعة والكون", "كيف تتكون الشهب والنيازك؟"],
 ["الطبيعة والكون", "لماذا لا تسقط الأقمار الصناعية من السماء؟"],
 ["الطبيعة والكون", "كيف تتواصل الأشجار داخل الغابات؟"],
 ["الطبيعة والكون", "ما سر هجرة الطيور لمسافات طويلة؟"],
 ["الطبيعة والكون", "كيف تتشكل الشعاب المرجانية؟"],

 // الحضارات والعادات
 ["الحضارات والعادات", "من أين جاءت عادة الاحتفال بعيد الميلاد؟"],
 ["الحضارات والعادات", "كيف كان الناس يقيسون الوقت قبل الساعات؟"],
 ["الحضارات والعادات", "قصة نشأة الأرقام العربية وانتشارها"],
 ["الحضارات والعادات", "كيف تطورت صناعة العملات المعدنية؟"],
 ["الحضارات والعادات", "لماذا تختلف طرق التحية بين الشعوب؟"],

 // قصص وأحداث
 ["قصص إنسانية", "قصة الرجل الذي أنقذ آلاف الأطفال خلال الحرب"],
 ["قصص إنسانية", "كيف ساهمت حملة تطوعية في إنقاذ قرية؟"],
 ["أحداث غيرت العالم", "كيف غيّر اختراع الطباعة انتشار المعرفة؟"],
 ["أحداث غيرت العالم", "قصة أول اتصال هاتفي في التاريخ"],
 ["أحداث غيرت العالم", "كيف غيّر اكتشاف البنسلين الطب؟"],

 // الاقتصاد والحياة
 ["الاقتصاد والحياة", "كيف ظهرت البنوك في العالم؟"],
 ["الاقتصاد والحياة", "لماذا ظهرت النقود الورقية؟"],
 ["الاقتصاد والحياة", "كيف يعمل مبدأ العرض والطلب؟"],
 ["الاقتصاد والحياة", "قصة نشأة التأمين وأهميته"],
 ["الاقتصاد والحياة", "كيف تطورت وسائل النقل من العربات إلى القطارات؟"]
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
  "INSERT OR IGNORE INTO auto_settings (key,value) VALUES ('blog_hours','')"
 ).run();

 await DB.prepare(
  "INSERT OR IGNORE INTO auto_settings (key,value) VALUES ('use_builtin','1')"
 ).run();

 await DB.prepare(
  "CREATE TABLE IF NOT EXISTS custom_topics (id INTEGER PRIMARY KEY AUTOINCREMENT,category TEXT NOT NULL,topic TEXT NOT NULL UNIQUE,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
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

 /* عناوين آخر المنشورات لمنع التكرار */
 let recentTopics = "";

 try {
  await ensureAutoSchema(env.DB);

  const rows = (await env.DB.prepare(
   "SELECT content FROM posts WHERE status='published' ORDER BY id DESC LIMIT 20"
  ).all()).results || [];

  recentTopics = rows
   .map(r => String(r.content || "").split("\n").map(x => x.trim()).find(Boolean))
   .filter(Boolean)
   .map(t => "- " + t.slice(0, 90))
   .join("\n");
 } catch (e) {
  console.log("recentTopics:", e.message);
 }

 const prompt = `
أنت محرر محتوى ثقافي وتاريخي محترف تعمل لصالح صفحة
فيسبوك عربية اسمها "أقوال".

مهمتك كتابة منشور معلوماتي قصير يتمتع بقيمة معرفية
حقيقية، ويجعل القارئ يرغب في قراءة المنشور ومشاركته.

بيانات الموضوع:
التصنيف: ${category}
الموضوع: ${topic}

أولاً: البحث والتحقق
- اعتمد على معلومات تاريخية وعلمية موثوقة.
- إذا كانت إمكانية البحث متاحة، تحقق من المعلومة
  بالرجوع إلى مصادر موثوقة قبل الكتابة.
- لا تختلق أحداثاً أو شخصيات أو تواريخ أو أرقاماً.
- لا تنسب اقتباساً إلى شخصية دون التأكد منه.
- ميّز بين الحقيقة التاريخية والروايات المختلف عليها.
- إذا كانت المعلومة غير مؤكدة، لا تعرضها كحقيقة.
- لا تكرر معلومة شائعة ثبت عدم صحتها.

ثانياً: أسلوب الكتابة
- اكتب باللغة العربية الفصحى السهلة والواضحة.
- اجعل الأسلوب طبيعياً وسلساً وغير آلي.
- ابدأ بعنوان قصير يجذب الانتباه دون مبالغة.
- قدم معلومة محددة ومفيدة في كل منشور.
- اشرح الفكرة مباشرة دون مقدمات طويلة.
- استخدم التفاصيل التي تضيف قيمة فقط.
- اجعل النص مناسباً للقراءة على الهاتف.
- لا تستخدم أسلوب المحاضرات أو المقالات المدرسية.
- ابتعد عن التهويل والعناوين المضللة.
- لا تكرر نفس الفكرة بصياغات مختلفة.

ثالثاً: معايير جودة المحتوى
- طول المحتوى من 40 إلى 80 كلمة.
- عنوان واضح ومميز.
- فكرة رئيسية واحدة فقط.
- اذكر الأسماء والتواريخ عند الحاجة فقط.
- وضح لماذا تستحق المعلومة أن يعرفها القارئ.
- اجعل كل منشور مستقلاً ومختلفاً عن غيره.
- لا تخترع قصصاً إنسانية أو حوارات درامية.
- لا تضف نصائح أو آراء شخصية غير مطلوبة.

رابعاً: التفاعل
- استخدم الفضول المعرفي لجذب القارئ.
- لا تستخدم أسئلة سطحية أو مصطنعة.
- لا تطلب الإعجاب أو المشاركة.
- لا تستخدم عبارات مثل:
  "هل تعلم؟" و"لن تصدق!" و"معلومة صادمة!".

خامساً: التنسيق النهائي
- ابدأ بعنوان جذاب.
- اترك سطراً فارغاً بعد العنوان.
- اكتب المحتوى في فقرة أو فقرتين قصيرتين.
- اختم بوسمين مناسبين بحد أقصى.
- لا تضف مصادر أو شروحات خارج المنشور.
- لا تكتب اسم الصفحة داخل المنشور.
- لا تستخدم Markdown أو علامات تنسيق برمجية.

سادساً: منع التكرار
الموضوعات والمنشورات السابقة:
${recentTopics || "لا توجد بيانات سابقة"}

لا تعِد إنتاج فكرة سبق نشرها حتى لو تغير العنوان.

النتيجة المطلوبة:
منشور عربي احترافي، دقيق، مختصر، ومفيد،
يليق بصفحة ثقافية تسعى لبناء جمهور يثق في محتواها.

أخرج المنشور النهائي فقط.
`;

 const d = await callGemini(env, {
  systemInstruction: {
   parts: [{
    text: "أنت محرر معلوماتي دقيق. الأولوية لصحة المعلومة واختصارها."
   }]
  },
  contents: [{ role: "user", parts: [{ text: prompt }] }],
  generationConfig: {
   temperature: 0.35,
   maxOutputTokens: 1200
  }
 });

 const result = (d.candidates?.[0]?.content?.parts || [])
  .map(x => x.text || "")
  .join("")
  .trim();

 if (!result) throw Error("Gemini لم يرجع محتوى");

 return result;
}

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

/* ---------- النشر على فيسبوك ---------- */

async function uploadPhoto(env, message, image) {
 const response = await fetchWikiImage(image.url);

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


/* ---------- المدونة (Blogger) ---------- */

const BLOG_URL = "https://aqwwaal.blogspot.com/";
let googleToken = { value: "", exp: 0 };

const blogConfigured = env =>
 !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);

async function getGoogleToken(env) {
 if (!blogConfigured(env)) {
  throw Error("إعدادات جوجل غير مكتملة (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN)");
 }

 if (googleToken.value && Date.now() < googleToken.exp) return googleToken.value;

 const r = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  body: new URLSearchParams({
   client_id: env.GOOGLE_CLIENT_ID,
   client_secret: env.GOOGLE_CLIENT_SECRET,
   refresh_token: env.GOOGLE_REFRESH_TOKEN,
   grant_type: "refresh_token"
  })
 });
 const d = await r.json();

 if (!r.ok || !d.access_token) {
  throw Error(
   d.error === "invalid_grant"
    ? "انتهت صلاحية رمز جوجل (invalid_grant): أنشئ رمزاً جديداً"
    : (d.error_description || "فشل الاتصال بجوجل")
  );
 }

 googleToken = {
  value: d.access_token,
  exp: Date.now() + (Number(d.expires_in || 3600) - 120) * 1000
 };

 return googleToken.value;
}

async function getBlogId(env) {
 if (env.BLOG_ID) return String(env.BLOG_ID);

 await ensureAutoSchema(env.DB);

 const cached = await env.DB.prepare(
  "SELECT value FROM auto_settings WHERE key='blog_id'"
 ).first();

 if (cached?.value) return cached.value;

 const token = await getGoogleToken(env);
 const u = new URL("https://www.googleapis.com/blogger/v3/blogs/byurl");
 u.searchParams.set("url", env.BLOG_URL || BLOG_URL);

 const r = await fetch(u, { headers: { Authorization: "Bearer " + token } });
 const d = await r.json();

 if (!r.ok || !d.id) throw Error(d.error?.message || "تعذر العثور على المدونة");

 await env.DB.prepare(
  "INSERT OR REPLACE INTO auto_settings (key,value) VALUES ('blog_id',?)"
 ).bind(String(d.id)).run();

 return String(d.id);
}

async function getBlogHours(env) {
 await ensureAutoSchema(env.DB);

 const s = await env.DB.prepare(
  "SELECT value FROM auto_settings WHERE key='blog_hours'"
 ).first();

 return [...new Set(
  String(s?.value ?? "").split(",").map(x => x.trim()).filter(x => x !== "")
   .map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 23)
 )].sort((a, b) => a - b);
}

async function geminiText(env, system, prompt, maxTokens, temperature) {
 if (!env.GEMINI_API_KEY) throw Error("GEMINI_API_KEY غير مضبوط");

 const d = await callGemini(env, {
  systemInstruction: { parts: [{ text: system }] },
  contents: [{ role: "user", parts: [{ text: prompt }] }],
  generationConfig: { temperature, maxOutputTokens: maxTokens }
 });

 const text = (d.candidates?.[0]?.content?.parts || [])
  .map(x => x.text || "").join("").trim();

 if (!text) throw Error("Gemini لم يرجع محتوى");

 return text;
}

/* تنظيف HTML المقال: وسوم مسموحة فقط وبلا أي سمات */
const BLOG_TAGS = new Set(["h2", "h3", "p", "ul", "ol", "li", "strong", "em", "blockquote", "br"]);

function cleanArticleHtml(html) {
 return String(html || "")
  .replace(/```(?:html)?/gi, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
  .replace(/<(\/?)h1\b[^>]*>/gi, "<$1h2>")
  .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (m, tag) => {
   const t = tag.toLowerCase();
   if (!BLOG_TAGS.has(t)) return "";
   return t === "br" ? "<br>" : (m.startsWith("</") ? `</${t}>` : `<${t}>`);
  })
  .trim();
}

async function generateArticle(env, topic, category) {
 const prompt = `اكتب مقالاً معلوماتياً أصيلاً لمدونة أقوال عن: ${topic}.
التصنيف: ${category}.

الشروط:
- من 600 إلى 900 كلمة بعربية فصيحة سهلة.
- السطر الأول: TITLE: ثم عنوان جذاب وصادق (حتى 70 حرفاً).
- بعده مباشرة جسم المقال بصيغة HTML فقط باستخدام الوسوم h2 وp وul وli وstrong وblockquote، دون html أو body أو h1 أو أي سمات أو أنماط.
- مقدمة قصيرة، ثم 3 إلى 5 أقسام بعناوين h2، ثم خلاصة.
- الدقة أولاً: لا تختلق أرقاماً أو تواريخ أو أسماء أو اقتباسات أو مصادر. إن لم تكن متأكداً من معلومة فاحذفها أو اذكر أنها محل خلاف.
- لا تنسب أقوالاً حرفية لأشخاص إلا إذا كانت موثقة ومشهورة جداً، وتجنب قوائم الاقتباسات.
- حياد ونبرة هادئة في الموضوعات السياسية والدينية الحساسة، ولا تمجّد العنف أو الكراهية ولا تهاجم جماعة بسبب انتمائها.
- لا تضع روابط ولا قسم مراجع.
- أخرج المقال فقط.`;

 const text = await geminiText(
  env,
  "أنت كاتب محتوى تاريخي وثقافي دقيق. الأولوية لصحة المعلومة وحيادها.",
  prompt, 6000, 0.4
 );

 const m = text.match(/^\s*TITLE:\s*(.+)$/mi);
 const title = (m?.[1] || topic).replace(/<[^>]*>/g, "").trim().slice(0, 120);
 const body = cleanArticleHtml(m ? text.replace(m[0], "") : text);

 if (body.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length < 250) {
  throw Error("المقال المولّد قصير جداً، أعد المحاولة");
 }

 return { title, body };
}

const escHtml = v => String(v || "").replace(/[&<>"]/g, c =>
 ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function buildBlogHtml(body, image) {
 const pic = image?.url
  ? `<div style="text-align:center"><img src="${escHtml(image.url)}" alt="" style="max-width:100%;height:auto;border-radius:8px"></div>\n`
  : "";

 const credit = image?.url
  ? `\n<p><small>📷 مصدر الصورة: <a href="${escHtml(image.page)}" rel="noopener">Wikimedia Commons</a>` +
    (image.author ? " — " + escHtml(image.author) : "") +
    (image.license ? " — " + escHtml(image.license) : "") + "</small></p>"
  : "";

 return pic + body + credit +
  '\n<p>تابعنا على فيسبوك: <a href="https://facebook.com/aqwwaal">facebook.com/aqwwaal</a></p>';
}

async function publishBlogPost(env, { title, html, labels }) {
 const token = await getGoogleToken(env);
 const blogId = await getBlogId(env);

 const r = await fetch(
  `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts`,
  {
   method: "POST",
   headers: {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json"
   },
   body: JSON.stringify({ kind: "blogger#post", title, content: html, labels })
  }
 );
 const d = await r.json();

 if (!r.ok || !d.url) throw Error(d.error?.message || "فشل النشر على المدونة");

 return { id: d.id, url: d.url };
}

/* ---------- القصص والريلز ---------- */

const MAX_REEL_BYTES = 60 * 1024 * 1024;

/* القصص لا تدعم نصاً مرافقاً، فلا نستخدم تلقائياً إلا صوراً لا تشترط ذكر المصدر */
const isCreditFree = license => /public domain|cc0|^pd([\s-]|$)/i.test(license || "");

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
 const r = await fetchWikiImage(imageUrl);

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

/* ---------- التنبيهات (تيليجرام) ---------- */

const notifyReady = env => !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);

async function notify(env, text) {
 if (!notifyReady(env)) return false;

 try {
  const r = await fetch(
   `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
   {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
     chat_id: env.TELEGRAM_CHAT_ID,
     text: String(text).slice(0, 3500),
     disable_web_page_preview: true
    })
   }
  );

  return r.ok;
 } catch (e) {
  console.log("notify:", e.message);
  return false;
 }
}

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
.tabs .wrap{display:flex;gap:4px;padding:6px 8px;overflow-x:auto;scrollbar-width:none}
.tabs button{flex:1 0 auto;background:none;color:var(--m);padding:8px 14px;font-size:14px;white-space:nowrap}
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
.hours button.blog{background:#1f7a4d;color:#fff}
#blogFrame{width:100%;height:320px;border:1px solid var(--b);border-radius:10px;background:#fff}
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
<button data-tab="blog" onclick="showTab('blog')">المدونة</button>
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

<section id="tab-blog" class="tab">
<div class="card">
<h2>مقال للمدونة</h2>
<p class="muted">يُنشأ مقال أصلي بصورة، تراجعه ثم تنشره على المدونة، ويمكن مشاركته على فيسبوك برابطه.</p>
<div id="blogConn" class="status"></div>
<label>الموضوع</label>
<input id="blogTopic" placeholder="مثال: نجيب محفوظ">
<label>التصنيف</label>
<select id="blogCategory">
<option>شخصيات مؤثرة</option><option>التاريخ العربي</option>
<option>تاريخ مصر</option><option>التاريخ العالمي</option>
<option>الثقافة والعلوم</option><option>ألغاز تاريخية</option>
<option>قصص إنسانية</option>
</select>
<button id="blogGenBtn" class="primary block" style="margin-top:12px" onclick="blogGenerate()">إنشاء المقال</button>
<div id="blogGenStatus" class="status"></div>
</div>

<div class="card">
<h2>المراجعة والنشر</h2>
<label>العنوان</label>
<input id="blogTitle">
<img id="blogImg" alt="" style="display:none;width:100%;max-height:220px;object-fit:cover;border-radius:10px;margin-top:10px">
<label>نص المقال (HTML)</label>
<textarea id="blogBody" oninput="blogPreview()" style="min-height:200px;direction:ltr;text-align:left;font-size:13px"></textarea>
<label>معاينة</label>
<iframe id="blogFrame" sandbox></iframe>
<div class="row">
<button class="secondary" onclick="blogPublish(false)">نشر على المدونة</button>
<button class="primary" onclick="blogPublish(true)">المدونة + فيسبوك</button>
</div>
<div id="blogPubStatus" class="status"></div>
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
<p class="muted">بتوقيت القاهرة. اضغط الساعة: مرة = منشور فيسبوك، مرتان (أخضر ✍) = منشور + مقال على المدونة، ثلاث = إلغاء.</p>
<div class="row" style="margin-top:0">
<button class="secondary" onclick="setPreset([2,6,10,14,18,22])">6 يومياً</button>
<button class="secondary" onclick="setPreset([2,6,10,14,18,22],[10,18])">6 + مقالان</button>
<button class="secondary" onclick="setPreset([8,14,20])">3 يومياً</button>
<button class="secondary" onclick="setPreset([12])">1 يومياً</button>
</div>
<div id="hoursGrid" class="hours"></div>
<p id="hoursSummary" class="muted"></p>
<button class="primary block" onclick="saveHours()">حفظ المواعيد</button>
<div id="hoursStatus" class="status"></div>
</div>

<div class="card">
<h2>المواضيع التلقائية</h2>
<p class="muted">مواضيعك تُستخدم أولاً، ثم القائمة المدمجة (<b id="builtinCount">0</b> موضوعاً).</p>
<label class="switch"><input type="checkbox" id="useBuiltin" onchange="saveBuiltin()"> استخدام القائمة المدمجة</label>
<label>التصنيف</label>
<select id="topicCategory">
<option>شخصيات مؤثرة</option><option>تاريخ مصر</option>
<option>التاريخ العربي</option><option>التاريخ العالمي</option>
<option>ألغاز واكتشافات</option><option>الثقافة والعلوم</option>
<option>الطبيعة والكون</option><option>الحضارات والعادات</option>
<option>قصص إنسانية</option><option>أحداث غيرت العالم</option>
<option>الاقتصاد والحياة</option>
</select>
<label>المواضيع (موضوع في كل سطر)</label>
<textarea id="topicsText" style="min-height:110px" placeholder="نجيب محفوظ وجائزة نوبل&#10;قصة بناء الهرم الأكبر"></textarea>
<button class="primary block" style="margin-top:10px" onclick="addTopics()">إضافة المواضيع</button>
<div id="topicsStatus" class="status"></div>
<div id="topicsList"></div>
</div>

<div class="card">
<h2>التنبيهات</h2>
<p class="muted">رسالة على تيليجرام عند فشل أي نشر تلقائي. تحتاج بوتاً من BotFather ومتغيري <code>TELEGRAM_BOT_TOKEN</code> و<code>TELEGRAM_CHAT_ID</code> في Cloudflare.</p>
<div id="notifyStatus" class="status"></div>
<button class="secondary block" style="margin-top:10px" onclick="testNotify()">إرسال تنبيه تجريبي</button>
</div>

<div class="card">
<h2>الصور</h2>
<label class="switch"><input type="checkbox" id="requireImage" onchange="saveRequireImage()"> عدم النشر بدون صورة</label>
<p class="muted" style="margin-top:14px">الصور الاحتياطية: <b id="fallbackCount">0</b> — تُستخدم عندما لا يجد البحث صورة مناسبة.</p>
<input id="fallbackUrl" placeholder="رابط صفحة ملف من commons.wikimedia.org">
<button class="secondary block" style="margin-top:8px" onclick="addFallback()">إضافة صورة احتياطية</button>
<div id="fallbackStatus" class="status"></div>
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
<!-- مثبّت على إصدار v1.0.0: عند تعديل app.js أنشئ وسم إصدار جديداً وحدّث الرابط هنا -->
<script src="https://cdn.jsdelivr.net/gh/mselnashar/Autopost@v1.0.0/app.js" defer></script>
</body>
</html>`;

/* واجهات API */

export default {
 async scheduled(event, env, ctx) {
  applyWikiUA(env);
  ctx.waitUntil(runAutomaticPost(env, event.scheduledTime));
 },

 async fetch(request, env) {
  applyWikiUA(env);
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

    return json({ ok: true, page: d.name, id: d.id, wikiContact: Boolean(env.WIKI_CONTACT) });
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
     blogHours: await getBlogHours(env),
     blogReady: blogConfigured(env),
     requireImage: await requireImage(env),
     autoStory: await autoStoryEnabled(env),
     notifyReady: notifyReady(env),
     draftMode: autoDraftEnabled(env),
     fallbackCount: (await env.DB.prepare("SELECT COUNT(*) c FROM fallback_images").first()).c,
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

    const d = await callGemini(env, {
     systemInstruction: {
      parts: [{ text: "أنت محرر تاريخي وثقافي محترف والدقة أهم من الإثارة." }]
     },
     contents: [{ role: "user", parts: [{ text: prompt }] }],
     generationConfig: {
      temperature: 0.75,
      maxOutputTokens: 2500
     }
    });

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

  if (url.pathname === "/api/topics" && request.method === "GET") {
   try {
    await ensureAutoSchema(env.DB);

    const items = (await env.DB.prepare(
     "SELECT id,category,topic FROM custom_topics ORDER BY id DESC LIMIT 300"
    ).all()).results || [];

    const s = await env.DB.prepare(
     "SELECT value FROM auto_settings WHERE key='use_builtin'"
    ).first();

    return json({
     ok: true,
     items,
     builtinCount: TOPICS.length,
     useBuiltin: s?.value !== "0"
    });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/topics/add" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);

    const b = await request.json();
    const category = String(b.category || "").trim().slice(0, 60) || "محتوى";
    const list = [...new Set(
     (Array.isArray(b.topics) ? b.topics : [])
      .map(x => String(x || "").trim().slice(0, 200))
      .filter(x => x.length >= 3)
    )].slice(0, 100);

    if (!list.length) {
     return json({ ok: false, error: "اكتب موضوعاً واحداً على الأقل (3 أحرف فأكثر)" }, 400);
    }

    let added = 0;

    for (const topic of list) {
     const r = await env.DB.prepare(
      "INSERT OR IGNORE INTO custom_topics (category,topic) VALUES (?,?)"
     ).bind(category, topic).run();
     added += r.meta.changes || 0;
    }

    return json({ ok: true, added, skipped: list.length - added });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/topics/delete" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);
    const id = Number((await request.json()).id);

    await env.DB.prepare("DELETE FROM custom_topics WHERE id=?").bind(id).run();

    return json({ ok: true });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/settings/builtin-topics" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);
    const v = (await request.json()).enabled === false ? "0" : "1";

    await env.DB.prepare(
     "UPDATE auto_settings SET value=? WHERE key='use_builtin'"
    ).bind(v).run();

    return json({ ok: true, use_builtin: v === "1" });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/notify/test" && request.method === "POST") {
   if (!notifyReady(env)) {
    return json({ ok: false, error: "أضف TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID في Cloudflare أولاً" }, 400);
   }

   /* نستدعي تيليجرام مباشرة لنعرض سبب الرفض الحقيقي */
   try {
    const r = await fetch(
     `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
     {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
       chat_id: env.TELEGRAM_CHAT_ID,
       text: "✅ تنبيه تجريبي من لوحة أقوال: الاتصال يعمل."
      })
     }
    );
    const d = await r.json().catch(() => ({}));

    if (r.ok && d.ok) return json({ ok: true });

    const why = String(d.description || "");
    let hint = "";

    if (/unauthorized|not found/i.test(why) && r.status === 401) hint = "التوكن خاطئ أو ناقص.";
    else if (/chat not found/i.test(why)) hint = "رقم المحادثة خاطئ، أو لم تضغط Start على البوت.";
    else if (/bot can't initiate|forbidden/i.test(why)) hint = "افتح محادثة مع البوت واضغط Start أولاً.";

    return json({
     ok: false,
     error: "تيليجرام: " + (why || ("HTTP " + r.status)) + (hint ? " — " + hint : "")
    }, 502);
   } catch (e) {
    return json({ ok: false, error: "تعذر الوصول إلى تيليجرام: " + e.message }, 502);
   }
  }

  if (url.pathname === "/api/blog/status" && request.method === "GET") {
   const configured = blogConfigured(env);

   if (!configured) {
    return json({ ok: true, configured: false, connected: false });
   }

   try {
    const token = await getGoogleToken(env);
    const blogId = await getBlogId(env);

    const r = await fetch(
     `https://www.googleapis.com/blogger/v3/blogs/${blogId}?fields=name,url`,
     { headers: { Authorization: "Bearer " + token } }
    );
    const d = await r.json();

    if (!r.ok) throw Error(d.error?.message || "تعذر قراءة المدونة");

    return json({ ok: true, configured: true, connected: true, name: d.name, url: d.url });
   } catch (e) {
    return json({ ok: true, configured: true, connected: false, error: e.message });
   }
  }

  if (url.pathname === "/api/blog/generate" && request.method === "POST") {
   try {
    const b = await request.json();
    const topic = String(b.topic || "").trim().slice(0, 300);
    const category = String(b.category || "محتوى");

    if (!topic) return json({ ok: false, error: "اكتب الموضوع أولاً" }, 400);

    let image = null;
    try {
     image = await findTopicImage(env, topic);
    } catch (e) {
     if (await requireImage(env)) throw e;
    }

    const article = await generateArticle(env, topic, category);

    return json({ ok: true, title: article.title, body: article.body, image });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/blog/publish" && request.method === "POST") {
   try {
    const b = await request.json();
    const title = String(b.title || "").trim().slice(0, 150);
    const body = cleanArticleHtml(b.body);
    const category = String(b.category || "محتوى");
    const topic = String(b.topic || "").trim().slice(0, 300) || title;

    if (!title || !body) {
     return json({ ok: false, error: "العنوان ونص المقال مطلوبان" }, 400);
    }

    /* الصورة المقبولة من ويكيميديا فقط */
    let image = null;
    try {
     const iu = new URL(String(b.image?.url || ""));
     if (iu.protocol === "https:" && iu.hostname === "upload.wikimedia.org") {
      image = {
       url: iu.href,
       page: String(b.image.page || ""),
       author: String(b.image.author || "").slice(0, 120),
       license: String(b.image.license || "").slice(0, 60)
      };
     }
    } catch (e) {}

    const blog = await publishBlogPost(env, {
     title,
     html: buildBlogHtml(body, image),
     labels: ["ALL", category]
    });

    let fbId = null;
    let fbError = null;

    if (b.share === true) {
     try {
      await ensureAutoSchema(env.DB);

      const teaser = await generateAutoContent(env, topic, category);
      const content = teaser + "\n\n📖 اقرأ المقال كاملاً: " + blog.url;

      fbId = await publishPost(env, content, image);

      await env.DB.prepare(
       "INSERT INTO posts (content,post_type,status,facebook_post_id,published_at,image_url,image_page,image_author,image_license) VALUES (?,?,'published',?,CURRENT_TIMESTAMP,?,?,?,?)"
      ).bind(
       content, category, fbId,
       image?.url || null, image?.page || null,
       image?.author || null, image?.license || null
      ).run();

      await env.DB.prepare(
       "INSERT INTO publish_logs (result,message,fb_post_id,image_url) VALUES ('success',?,?,?)"
      ).bind(fbId, fbId, image?.url || null).run();
     } catch (e) {
      fbError = e.message;
     }
    }

    return json({ ok: true, blog_url: blog.url, fb_id: fbId, fbError });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/fallback/add" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);

    const b = await request.json();
    const m = String(b.page || "").match(/commons\.wikimedia\.org\/wiki\/(File:[^?#\s]+)/i);

    if (!m) {
     return json({ ok: false, error: "الصق رابط صفحة الملف من ويكيميديا كومنز (يحتوي File:)" }, 400);
    }

    const api = new URL("https://commons.wikimedia.org/w/api.php");
    api.searchParams.set("action", "query");
    api.searchParams.set("titles", decodeURIComponent(m[1]).replace(/_/g, " "));
    api.searchParams.set("prop", "imageinfo");
    api.searchParams.set("iiprop", "url|extmetadata|size|mime");
    api.searchParams.set("iiurlwidth", "1280");
    api.searchParams.set("format", "json");

    const r = await fetch(api, { headers: { "User-Agent": WIKI_UA } });
    const i = Object.values((await r.json()).query?.pages || {})[0]?.imageinfo?.[0];

    if (!i) return json({ ok: false, error: "لم أجد هذا الملف" }, 404);

    if (!["image/jpeg", "image/png"].includes(i.mime)) {
     return json({ ok: false, error: "الصيغة غير مدعومة (المطلوب JPEG أو PNG)" }, 400);
    }

    const license = cleanHtml(i.extmetadata?.LicenseShortName?.value);

    if (!licenseOk(license)) {
     return json({ ok: false, error: "الترخيص غير مناسب: " + (license || "غير معروف") }, 400);
    }

    const imgUrl = i.thumburl || i.url;

    const exists = await env.DB.prepare(
     "SELECT id FROM fallback_images WHERE url=?"
    ).bind(imgUrl).first();

    if (!exists) {
     await env.DB.prepare(
      "INSERT INTO fallback_images (url,author,license,page_url) VALUES (?,?,?,?)"
     ).bind(
      imgUrl,
      cleanHtml(i.extmetadata?.Artist?.value).slice(0, 120),
      license,
      i.descriptionurl
     ).run();
    }

    const count = (await env.DB.prepare("SELECT COUNT(*) c FROM fallback_images").first()).c;

    return json({ ok: true, count, license, title: m[1].replace(/_/g, " ") });
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

    let r;

    try {
     r = await fetchWikiImage(u.href);
    } catch (e) {
     return json({ ok: false, error: e.message }, 502);
    }

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

    /* ساعات المقالات يجب أن تكون ضمن ساعات النشر */
    const blogList = [...new Set(
     (Array.isArray(b.blogHours) ? b.blogHours : []).map(Number)
      .filter(n => list.includes(n))
    )].sort((a, c) => a - c);

    await env.DB.prepare(
     "UPDATE auto_settings SET value=? WHERE key='blog_hours'"
    ).bind(blogList.join(",")).run();

    return json({
     ok: true,
     hours: list,
     blogHours: blogList,
     nextRun: nextCairoRun(new Date(), list)
    });
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

    let image;

    try {
     image = await findTopicImage(env, topic, {
      postId: id,
      context: explicit ? "" : p.content,
      skip: p.image_url ? [p.image_url] : []
     });
    } catch (e) {
     return json({ ok: false, error: "لا توجد صورة بديلة أخرى لهذا الموضوع" }, 404);
    }

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
