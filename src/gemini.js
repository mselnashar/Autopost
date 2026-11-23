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
/* ---------- استدعاء Gemini ---------- */
import { DEFAULT_GEMINI_MODEL, DEFAULT_FALLBACK_MODEL, sleep } from "./config.js";

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

export { callGemini, geminiText };
