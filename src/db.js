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

 await DB.prepare(
  `CREATE TABLE IF NOT EXISTS post_analytics (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   post_id INTEGER NOT NULL UNIQUE,
   fb_post_id TEXT,
   reach INTEGER DEFAULT 0,
   impressions INTEGER DEFAULT 0,
   engaged_users INTEGER DEFAULT 0,
   reactions INTEGER DEFAULT 0,
   comments INTEGER DEFAULT 0,
   shares INTEGER DEFAULT 0,
   score REAL DEFAULT 0,
   fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
 ).run();

 autoReady = true;
}

export { addMissingColumns, ensurePostsSchema, ensurePublishLogsSchema, ensureAutoSchema };
