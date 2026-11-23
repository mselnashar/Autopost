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
import { BLOG_URL, escHtml } from "./config.js";
import { ensureAutoSchema } from "./db.js";


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

export { blogConfigured, getGoogleToken, getBlogId, getBlogHours, buildBlogHtml, publishBlogPost };
