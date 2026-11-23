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
/* الإعدادات والثوابت والأدوات العامة المشتركة */

const DEFAULT_PAGE_ID = "282216368809712";

/* ---------- النشر على منصات إضافية: إنستغرام، قناة تيليجرام، إكس ---------- */
/* كل منصة خلف مفتاح تفعيل في auto_settings (platform_*) ومفاتيحها السرية في Cloudflare.
   فشل أي منصة إضافية لا يؤثر على نشر فيسبوك أبداً. */

import { GRAPH_VERSION, pageId } from "./config.js";
import { ensureAutoSchema } from "./db.js";
import { fetchWikiImage } from "./images.js";

/* قطع النص عند حد الكلمات */
function truncate(text, max) {
 const t = String(text || "").trim();

 if (t.length <= max) return t;

 const cut = t.slice(0, max - 1);
 const sp = cut.lastIndexOf(" ");

 return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

async function platformEnabled(env, key) {
 await ensureAutoSchema(env.DB);

 const s = await env.DB.prepare(
  "SELECT value FROM auto_settings WHERE key=?"
 ).bind("platform_" + key).first();

 return s?.value === "1";
}

const igConfigured = env => !!(env.IG_BUSINESS_ID && env.PAGE_ACCESS_TOKEN);
const tgChannelConfigured = env => !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHANNEL_ID);
const xConfigured = env =>
 !!(env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET);

/* حالة المنصات للوحة التحكم */
async function platformsStatus(env) {
 return {
  instagram: { enabled: await platformEnabled(env, "instagram"), configured: igConfigured(env) },
  telegram: { enabled: await platformEnabled(env, "telegram"), configured: tgChannelConfigured(env) },
  x: { enabled: await platformEnabled(env, "x"), configured: xConfigured(env) }
 };
}

/* ---------- إنستغرام (حساب أعمال مربوط بالصفحة، يتطلب صورة) ---------- */
async function publishToInstagram(env, content, image) {
 if (!igConfigured(env)) throw Error("إنستغرام غير مضبوط (IG_BUSINESS_ID / PAGE_ACCESS_TOKEN)");
 if (!image?.url) throw Error("إنستغرام يتطلب صورة");

 const ig = env.IG_BUSINESS_ID;
 const token = env.PAGE_ACCESS_TOKEN;
 const caption = truncate(content, 2100);

 const mk = await fetch(
  `https://graph.facebook.com/${GRAPH_VERSION}/${ig}/media`,
  {
   method: "POST",
   body: new URLSearchParams({
    image_url: image.url,
    caption,
    access_token: token
   })
  }
 );
 const md = await mk.json();

 if (!mk.ok || !md.id) throw Error(md.error?.message || "فشل إنشاء وسيط إنستغرام");

 const pub = await fetch(
  `https://graph.facebook.com/${GRAPH_VERSION}/${ig}/media_publish`,
  {
   method: "POST",
   body: new URLSearchParams({ creation_id: md.id, access_token: token })
  }
 );
 const pd = await pub.json();

 if (!pub.ok || !pd.id) throw Error(pd.error?.message || "فشل نشر إنستغرام");

 return String(pd.id);
}

/* ---------- قناة تيليجرام ---------- */
async function publishToTelegramChannel(env, content, image) {
 if (!tgChannelConfigured(env)) {
  throw Error("قناة تيليجرام غير مضبوطة (TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID)");
 }

 const base = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

 /* التسمية المصاحبة للصورة محدودة بـ 1024 حرفاً */
 const endpoint = image?.url ? "/sendPhoto" : "/sendMessage";
 const body = image?.url
  ? {
    chat_id: env.TELEGRAM_CHANNEL_ID,
    photo: image.url,
    caption: truncate(content, 1000)
   }
  : {
    chat_id: env.TELEGRAM_CHANNEL_ID,
    text: truncate(content, 4000),
    disable_web_page_preview: false
   };

 const r = await fetch(base + endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
 });
 const d = await r.json();

 if (!r.ok || !d.ok) throw Error(d.description || "فشل النشر على تيليجرام");

 return String(d.result?.message_id || "");
}

/* ---------- إكس (OAuth 1.0a) ---------- */
const pct = v => encodeURIComponent(String(v)).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16));

async function hmacSha1Base64(key, msg) {
 const enc = new TextEncoder();
 const k = await crypto.subtle.importKey(
  "raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
 );
 const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
 return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function xAuthHeader(env, method, url) {
 const oauth = {
  oauth_consumer_key: env.X_API_KEY,
  oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
  oauth_signature_method: "HMAC-SHA1",
  oauth_timestamp: Math.floor(Date.now() / 1000),
  oauth_token: env.X_ACCESS_TOKEN,
  oauth_version: "1.0"
 };

 const paramString = Object.keys(oauth).sort()
  .map(k => pct(k) + "=" + pct(oauth[k])).join("&");

 const base = method.toUpperCase() + "&" + pct(url) + "&" + pct(paramString);
 const key = pct(env.X_API_SECRET) + "&" + pct(env.X_ACCESS_SECRET);

 oauth.oauth_signature = await hmacSha1Base64(key, base);

 return "OAuth " + Object.keys(oauth).sort()
  .map(k => pct(k) + "=\"" + pct(oauth[k]) + "\"").join(", ");
}

async function xUploadMedia(env, blob) {
 const url = "https://upload.twitter.com/1.1/media/upload.json";
 const form = new FormData();

 form.set("media", blob, "image." + (blob.type === "image/png" ? "png" : "jpg"));

 const r = await fetch(url, {
  method: "POST",
  headers: { Authorization: await xAuthHeader(env, "POST", url) },
  body: form
 });
 const d = await r.json().catch(() => ({}));

 if (!r.ok || !d.media_id_string) {
  throw Error(d.error || d.errors?.[0]?.message || "فشل رفع الصورة إلى إكس");
 }

 return d.media_id_string;
}

async function publishToX(env, content, image) {
 if (!xConfigured(env)) {
  throw Error("إكس غير مضبوط (X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET)");
 }

 /* الوسائط اختيارية: فشل رفعها لا يمنع التغريدة النصية */
 let mediaId = null;

 if (image?.url) {
  try {
   const r = await fetchWikiImage(image.url);
   const blob = await r.blob();

   if (blob.type.startsWith("image/") && blob.size <= 5 * 1024 * 1024) {
    mediaId = await xUploadMedia(env, blob);
   }
  } catch (e) {
   console.log("X media:", e.message);
  }
 }

 const tweet = { text: truncate(content, 270) };

 if (mediaId) tweet.media = { media_ids: [mediaId] };

 const url = "https://api.x.com/2/tweets";

 const r = await fetch(url, {
  method: "POST",
  headers: {
   Authorization: await xAuthHeader(env, "POST", url),
   "Content-Type": "application/json"
  },
  body: JSON.stringify(tweet)
 });
 const d = await r.json().catch(() => ({}));

 if (!r.ok || !d.data?.id) {
  throw Error(d.detail || d.errors?.[0]?.message || d.title || "فشل النشر على إكس");
 }

 return d.data.id;
}

/* ---------- التوزيع الموحد: ينشر على المنصات المفعّلة ويجمع النتائج ---------- */
const PLATFORM_NAMES = { instagram: "إنستغرام", telegram: "تيليجرام", x: "إكس" };
const PLATFORM_FUNS = { instagram: publishToInstagram, telegram: publishToTelegramChannel, x: publishToX };

async function publishExtraPlatforms(env, content, image) {
 const results = {};

 for (const key of Object.keys(PLATFORM_FUNS)) {
  if (!(await platformEnabled(env, key))) continue;

  try {
   results[key] = { ok: true, id: await PLATFORM_FUNS[key](env, content, image) };
  } catch (e) {
   results[key] = { ok: false, error: String(e.message || e).slice(0, 200) };
  }
 }

 const okNames = Object.keys(results).filter(k => results[k].ok).map(k => PLATFORM_NAMES[k]);
 const badNames = Object.keys(results).filter(k => !results[k].ok).map(k => PLATFORM_NAMES[k]);

 let note = "";

 if (okNames.length) note += " + " + okNames.join(" و");
 if (badNames.length) note += " (فشل: " + badNames.join("، ") + ")";

 return { results, note };
}

export {
 truncate, platformEnabled, platformsStatus, publishExtraPlatforms,
 publishToInstagram, publishToTelegramChannel, publishToX
};
