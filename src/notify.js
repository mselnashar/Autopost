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

export { notifyReady, notify };
