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
.acat{display:flex;justify-content:space-between;align-items:center;gap:8px;border-bottom:1px solid var(--b);padding:8px 0;font-size:14px}
.acat:last-child,.apost:last-child{border-bottom:0}
.apost{border-bottom:1px solid var(--b);padding:10px 0;font-size:14px}
.apost .at{white-space:pre-wrap;overflow-wrap:anywhere}
.apost .am{color:var(--m);font-size:12px;margin-top:4px}
.cal{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.calday{background:#f8f6fb;border:1px solid var(--b);border-radius:10px;padding:8px;font-size:12px}
.calday b{display:block;margin-bottom:4px;color:var(--d)}
.chip{display:inline-block;background:#f0ecf6;color:var(--d);border-radius:8px;padding:2px 6px;margin:2px;font-size:11px}
.chip.sch{background:#fdf0d5;color:#7a5a00}
.chip.pub{background:#eaf7ef;color:var(--ok)}
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
<button data-tab="analytics" onclick="showTab('analytics')">الإحصاءات</button>
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
<h2>قائمة الجدولة</h2>
<p class="muted">منشورات مجدولة تُنشر تلقائياً في أول دورة ساعية بعد موعدها (بتوقيت القاهرة).</p>
<div id="scheduledList">أدخل مفتاح الإدارة للبدء</div>
</div>

<div class="card">
<h2>تقويم النشر</h2>
<p class="muted">الأيام السبعة القادمة: المواعيد التلقائية والمنشورات المجدولة والمنشورة.</p>
<div id="calGrid" class="cal"></div>
</div>

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

<section id="tab-analytics" class="tab">
<div class="card">
<h2>أداء المنشورات</h2>
<p class="muted">تُجمع مقاييس فيسبوك (الوصول والتفاعل) كل ساعة لأحدث المنشورات، وتُحسّن التوليد واختيار المواضيع تلقائياً.</p>
<div class="stats">
<div class="stat"><strong id="anaMeasured">—</strong>منشورات مقاسة</div>
<div class="stat"><strong id="anaReach">—</strong>متوسط الوصول</div>
<div class="stat"><strong id="anaScore">—</strong>متوسط النقاط</div>
</div>
<div class="stats" style="margin-top:8px">
<div class="stat"><strong id="anaReactions">—</strong>إعجابات</div>
<div class="stat"><strong id="anaComments">—</strong>تعليقات</div>
<div class="stat"><strong id="anaShares">—</strong>مشاركات</div>
</div>
<button class="secondary block" style="margin-top:12px" onclick="refreshAnalytics()">تحديث المقاييس الآن</button>
<div id="anaStatus" class="status"></div>
</div>

<div class="card">
<h2>أداء التصنيفات</h2>
<p class="muted">النشر التلقائي يرجّح التصنيفات الأعلى تفاعلاً.</p>
<div id="anaCategories">أدخل مفتاح الإدارة للبدء</div>
</div>

<div class="card">
<h2>أحدث المنشورات المقاسة</h2>
<div id="anaPosts">—</div>
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
<h2>النشر على منصات أخرى</h2>
<p class="muted">مع كل منشور فيسبوك يُنشر تلقائياً على المنصات المفعّلة. كل منصة تحتاج مفاتيحها في Cloudflare (انظر README).</p>
<label class="switch"><input type="checkbox" id="pfInstagram" onchange="togglePlatform('instagram')"> إنستغرام <span id="pfInstagramState" class="muted"></span></label>
<label class="switch"><input type="checkbox" id="pfTelegram" onchange="togglePlatform('telegram')"> قناة تيليجرام <span id="pfTelegramState" class="muted"></span></label>
<label class="switch"><input type="checkbox" id="pfX" onchange="togglePlatform('x')"> إكس (تويتر) <span id="pfXState" class="muted"></span></label>
<div id="pfStatus" class="status"></div>
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
<!-- مثبّت على إصدار v1.2.0: عند تعديل app.js أنشئ وسم إصدار جديداً وحدّث الرابط هنا -->
<script src="https://cdn.jsdelivr.net/gh/mselnashar/Autopost@v1.4.0/app.js" defer></script>
</body>
</html>`;

export { html };
