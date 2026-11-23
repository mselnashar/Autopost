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
import { GRAPH_VERSION, pageId, sleep } from "./config.js";
import { ensureAutoSchema } from "./db.js";
import { fetchWikiImage, requireImage } from "./images.js";

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

export { uploadPhoto, publishPhotoToFacebook, publishToFacebook, publishPost, autoStoryEnabled, publishStoryBlob, publishStoryFromUrl, publishReel };
