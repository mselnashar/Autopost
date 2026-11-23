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
import { DEFAULT_HOURS } from "./config.js";
import { ensureAutoSchema } from "./db.js";

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

export { cairoParts, cairoSlot, nextCairoRun, getHours };
