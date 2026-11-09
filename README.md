Autopost — أقوال

بوت نشر تلقائي لصفحة فيسبوك، مبني على Cloudflare Workers مع قاعدة بيانات D1،
يتولّد المحتوى عبر Gemini AI ويختار صورة من Wikimedia Commons مع ذكر المصدر والترخيص.

المزايا

- نشر تلقائي كل 4 ساعات بتوقيت القاهرة (10:00، 14:00، 18:00، 22:00، 02:00، 06:00)
- توليد منشورات قصيرة (40–80 كلمة) بمواضيع تاريخية وثقافية متنوعة دون تكرار آخر 30 موضوعاً
- صورة مرتبطة بالموضوع من Wikimedia Commons مع الإسناد (المصدر/الصاحب/الترخيص)
- لوحة تحكم عربية: إنشاء محتوى بالذكاء الاصطناعي، مسودات، معاينة، نشر مباشر، سجل المحاولات
- تتبع كامل للحالات في جداول `posts` و `publish_logs` و `auto_runs`

الإعداد

```bash
npm install -g wrangler
wrangler login

# المفاتيح السرية
wrangler secret put ADMIN_KEY          # مفتاح لوحة التحكم
wrangler secret put GEMINI_API_KEY     # مفتاح Gemini API
wrangler secret put PAGE_ACCESS_TOKEN  # توكن صفحة فيسبوك

# قاعدة البيانات (مرة واحدة)
wrangler d1 create aqwal-database
# ثم انسخ database_id إلى wrangler.jsonc

wrangler deploy
```

متغيرات اختيارية

المتغير	الوصف	
`FB_PAGE_ID`	رقم الصفحة (افتراضياً مضبوط داخل الكود)	
`GEMINI_MODEL`	نموذج Gemini (افتراضياً `gemini-3.5-flash-lite`)	

ملاحظات

- النشر التلقائي متوقف افتراضياً — فعّله من لوحة التحكم.
- الجداول تُنشأ تلقائياً عند أول تشغيل (`posts`, `publish_logs`, `auto_settings`, `auto_topics`, `auto_runs`).
- جدول `wrangler.jsonc` يشغّل cron كل ساعة؛ يتحقق العامل من ساعة القاهرة وينشر فقط في المواعيد الستة (تحقق مقاوم لأي انزياح توقيت).
- لوحة التحكم في `app.js` تُحمَّل عبر jsDelivr من هذا المستودع. 