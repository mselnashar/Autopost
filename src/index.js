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

/* نقطة الدخول: الجدولة، قائمة انتظار النشر، وطلبات HTTP */

import { applyWikiUA } from "./images.js";
import { runAutomaticPost } from "./auto.js";
import { scanAnalytics } from "./analytics.js";
import { handleRequest } from "./api.js";

export default {
 /* الكرون كل ساعة يضع مهمة النشر في القائمة؛ بدون الربط يعمل مباشرة كما كان */
 async scheduled(event, env, ctx) {
  applyWikiUA(env);

  if (env.PUBLISH_QUEUE) {
   ctx.waitUntil(env.PUBLISH_QUEUE.sendBatch([
    { body: { type: "auto-slot", scheduledTime: event.scheduledTime } },
    { body: { type: "analytics-scan" } }
   ]));
  } else {
   ctx.waitUntil(runAutomaticPost(env, event.scheduledTime));
   ctx.waitUntil(scanAnalytics(env));
  }
 },

 /* مستهلك القائمة: ينفذ مهمة النشر لموعدها، وإعادة المحاولة آمنة (auto_runs.slot_key فريد) */
 async queue(batch, env) {
  applyWikiUA(env);

  for (const message of batch.messages) {
   const body = message.body || {};

   if (body.type === "auto-slot") {
    await runAutomaticPost(env, body.scheduledTime || Date.now());
   } else if (body.type === "analytics-scan") {
    await scanAnalytics(env);
   }

   message.ack();
  }
 },

 async fetch(request, env) {
  return handleRequest(request, env);
 }
};
