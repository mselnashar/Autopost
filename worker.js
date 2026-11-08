const PAGE_ID="282216368809712", GRAPH_VERSION="v27.0",
GEMINI_MODEL="gemini-3.5-flash-lite";
const TOPICS=[
["تاريخ مصر","الحياة اليومية في مصر القديمة"],["التاريخ العربي","بيت الحكمة وحركة الترجمة في بغداد"],
["التاريخ العالمي","مدينة بومبي قبل ثوران البركان"],["شخصيات مؤثرة","ابن الهيثم وأثره في المنهج العلمي"],
["ألغاز تاريخية","لغز مستعمرة رونوك"],["الثقافة والعلوم","كيف غيّر اختراع الورق مسار المعرفة؟"],
["قصص إنسانية","قصة تضامن إنساني غيّرت حياة أشخاص"],["تاريخ مصر","قصة إنشاء مكتبة الإسكندرية القديمة"],
["التاريخ العربي","رحلات ابن بطوطة"],["التاريخ العالمي","اكتشاف حجر رشيد وفك رموزه"],
["شخصيات مؤثرة","ماري كوري ورحلتها العلمية"],["الثقافة والعلوم","كيف تعمل الذاكرة البشرية؟"],
["تاريخ مصر","قصة قناة السويس"],["التاريخ العربي","الخوارزمي وتطور علم الجبر"],
["الثقافة والعلوم","لماذا نرى البرق قبل سماع الرعد؟"]
];

const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#302052"><title>أقوال | إدارة المحتوى</title>
<style>
:root{--p:#6845a3;--d:#302052;--bg:#f6f3fb;--t:#29243b;--m:#89839a;--b:#ebe7f1}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font:16px Arial,Tahoma;line-height:1.7}button,input,textarea,select{font:inherit}button{cursor:pointer;border:0}.top{background:linear-gradient(135deg,#302052,#67439c);color:white;padding:22px}.wrap,main{max-width:950px;margin:auto}.brand{font-size:25px;font-weight:bold}.brand small{display:block;font-size:13px;font-weight:normal;color:#ddd1f1}.top p{color:#e7def3}main{padding:15px}.card{background:white;border:1px solid var(--b);border-radius:16px;padding:17px;margin-bottom:14px}.head{display:flex;justify-content:space-between;align-items:center;gap:8px}.head h2{font-size:18px;margin:0 0 12px}.muted{font-size:13px;color:var(--m)}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.stat{background:#f8f6fb;border:1px solid var(--b);border-radius:12px;padding:10px}.stat strong{display:block;font-size:24px;color:var(--d)}label{display:block;font-size:13px;font-weight:bold;margin:10px 0 5px}input,textarea,select{width:100%;padding:11px;border:1px solid #ded9e7;border-radius:10px;background:white;color:var(--t)}textarea{min-height:240px;line-height:1.9}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}button.primary{background:var(--p);color:white;padding:10px 15px;border-radius:10px}button.secondary{background:#f0ecf6;color:var(--d);padding:9px 13px;border-radius:10px}button.danger{background:#fff0f1;color:#a32d42;padding:9px 13px;border-radius:10px}.status{padding:10px 12px;background:#f2edf9;border-radius:10px;margin:10px 0;font-size:14px}.ok{background:#eaf7ef;color:#176c3d}.err{background:#fff0f1;color:#a32d42}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.preview,.post{border:1px solid var(--b);border-radius:12px;padding:13px;white-space:pre-wrap;overflow-wrap:anywhere}.post{margin:10px 0}.tag{font-size:11px;background:#f0ecf8;color:#63428d;padding:4px 8px;border-radius:20px}.footer{text-align:center;color:var(--m);font-size:12px;padding:20px}@media(max-width:620px){.grid{grid-template-columns:1fr}main{padding:10px}.card{padding:14px}.stat strong{font-size:21px}}
</style></head><body>
<header class="top"><div class="wrap"><div class="brand">أقوال<small>مركز إدارة المحتوى والنشر الذكي</small></div><p>إدارة المحتوى والنشر على صفحة Facebook</p></div></header>
<main>
<section class="card"><div class="head"><h2>لوحة التحكم</h2><span class="tag">الرئيسية</span></div><div class="stats"><div class="stat">إجمالي المنشورات<strong id="total">—</strong></div><div class="stat">المسودات<strong id="draftCount">—</strong></div><div class="stat">المنشورة<strong id="publishedCount">—</strong></div></div><div id="connection" class="status">أدخل مفتاح الإدارة لفحص الاتصال</div><label>مفتاح الإدارة</label><input id="admin" type="password" placeholder="ADMIN_KEY"><div class="actions"><button class="primary" onclick="checkConnection()">فحص الاتصال</button><button class="secondary" onclick="refreshAll()">تحديث البيانات</button></div></section>

<section class="card"><div class="head"><h2>النشر التلقائي</h2><span class="tag">كل 4 ساعات</span></div><div id="autoStatus" class="status">متوقف افتراضياً — لن ينشر قبل تفعيله</div><p class="muted">مواعيد القاهرة: 10:00، 14:00، 18:00، 22:00، 02:00، 06:00. يتجنب آخر 30 موضوعاً.</p><div class="actions"><button id="autoToggle" class="primary" onclick="toggleAuto()">تفعيل النشر التلقائي</button><button class="secondary" onclick="loadAuto()">تحديث السجل</button></div><p id="nextRun" class="muted"></p><hr><b>آخر المحاولات</b><div id="autoLogs">لا توجد محاولات بعد.</div></section>

<section class="card"><div class="head"><h2>إنشاء محتوى جديد</h2><span class="tag">Gemini AI</span></div><label>موضوع المنشور</label><input id="topic" placeholder="اكتب موضوع المنشور"><label>التصنيف</label><select id="category"><option>تاريخ مصر</option><option>التاريخ العربي</option><option>التاريخ العالمي</option><option>شخصيات مؤثرة</option><option>ثقافة وعلوم</option><option>قصص إنسانية</option><option>ألغاز تاريخية</option><option>أقوال وحكم</option></select><label>حجم المحتوى</label><select id="length"><option>200 إلى 300 كلمة</option><option selected>400 إلى 600 كلمة</option><option>600 إلى 800 كلمة</option><option>100 إلى 150 كلمة</option></select><label>تعليمات إضافية</label><input id="extra" placeholder="اختياري"><button id="generateBtn" class="primary" style="width:100%;margin-top:12px" onclick="generate()">إنشاء المحتوى</button><div id="aiStatus" class="status">اكتب الموضوع ثم ابدأ.</div></section>

<section class="card"><h2>محرر المنشورات</h2><div class="grid"><div><label>نص المنشور</label><textarea id="message" placeholder="اكتب أو أنشئ منشوراً..."></textarea><div class="actions"><button class="primary" onclick="saveDraft()">حفظ كمسودة</button><button class="secondary" onclick="copyText()">نسخ النص</button><button class="secondary" onclick="clearEditor()">مسح</button></div></div><div><label>المعاينة</label><div id="preview" class="preview">ستظهر المعاينة هنا.</div><p id="wordCount" class="muted">0 كلمة</p></div></div></section>

<section class="card"><div class="head"><h2>المسودات المحفوظة</h2><button class="secondary" onclick="loadDrafts()">تحديث</button></div><div id="drafts">اضغط تحديث لعرض المسودات.</div></section>
<section class="card"><h2>النشر المباشر</h2><p class="muted">النشر هنا يتم فوراً على صفحة Facebook.</p><button class="primary" onclick="publishText()">نشر المنشور الحالي</button><div id="publishStatus" class="status">لم يتم النشر بعد.</div></section>
<div class="footer">أقوال © مركز إدارة المحتوى</div></main>
<script src="https://cdn.jsdelivr.net/gh/mselnashar/Autopost@main/app.js" defer></script> 
</body></html>`;

function json(data,status=200){return Response.json(data,{status})}
async function ensureAutoSchema(DB){
 await DB.prepare("CREATE TABLE IF NOT EXISTS auto_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)").run();
 await DB.prepare("INSERT OR IGNORE INTO auto_settings (key,value) VALUES ('enabled','0')").run();
 await DB.prepare("CREATE TABLE IF NOT EXISTS auto_topics (id INTEGER PRIMARY KEY AUTOINCREMENT,topic TEXT NOT NULL UNIQUE,category TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)").run();
 await DB.prepare("CREATE TABLE IF NOT EXISTS auto_runs (id INTEGER PRIMARY KEY AUTOINCREMENT,slot_key TEXT NOT NULL UNIQUE,status TEXT NOT NULL,post_id INTEGER,topic TEXT,message TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)").run();
}
function cairoSlot(date){const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Cairo",hour:"2-digit",minute:"2-digit",year:"numeric",month:"2-digit",day:"2-digit",hourCycle:"h23"}).formatToParts(date).map(x=>[x.type,x.value]));return {hour:+p.hour,minute:+p.minute,key:`${p.year}-${p.month}-${p.day}-${p.hour}`}}
function nextCairoRun(now=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Cairo",hour:"2-digit",minute:"2-digit",year:"numeric",month:"2-digit",day:"2-digit",hourCycle:"h23"}).formatToParts(now).map(x=>[x.type,x.value]));const hours=[2,6,10,14,18,22],h=+p.hour,m=+p.minute;let next=hours.find(x=>x>h||(x===h&&m<1)),day=0;if(next===undefined){next=2;day=1}return new Date(Date.UTC(+p.year,+p.month-1,+p.day+day,next-2,0)).toISOString()}
async function generateAutoContent(env,topic,category){
 if(!env.GEMINI_API_KEY)throw Error("GEMINI_API_KEY غير مضبوط");

 const prompt=`اكتب منشور معلومات قصيراً لصفحة أقوال عن: ${topic}.
التصنيف: ${category}.

الشروط:
- من 40 إلى 80 كلمة فقط.
- معلومة واحدة محددة ومفيدة.
- عنوان قصير وجذاب.
- شرح مباشر بلغة عربية سهلة.
- دون مقدمات إنشائية أو حشو أو تكرار.
- لا تختلق أرقاماً أو تواريخ أو اقتباسات.
- اختم بوسمين مناسبين كحد أقصى.
- أخرج المنشور فقط.`;

 const r=await fetch(
 "https://generativelanguage.googleapis.com/v1beta/models/"+GEMINI_MODEL+":generateContent",
 {
  method:"POST",
  headers:{
   "Content-Type":"application/json",
   "x-goog-api-key":env.GEMINI_API_KEY
  },
  body:JSON.stringify({
   systemInstruction:{
    parts:[{text:"أنت محرر معلوماتي دقيق. الأولوية لصحة المعلومة واختصارها ومنع الحشو."}]
   },
   contents:[{role:"user",parts:[{text:prompt}]}],
   generationConfig:{temperature:.35,maxOutputTokens:350}
  })
 });

 const d=await r.json();
 if(!r.ok)throw Error(d.error?.message||"فشل Gemini");

 const result=(d.candidates?.[0]?.content?.parts||[])
 .map(x=>x.text||"").join("").trim();

 if(!result)throw Error("Gemini لم يرجع محتوى");
 return result;
 }
async function publishToFacebook(env,message){
 if(!env.PAGE_ACCESS_TOKEN)throw Error("PAGE_ACCESS_TOKEN غير مضبوط");
 const u=new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/feed`);u.searchParams.set("message",message);u.searchParams.set("access_token",env.PAGE_ACCESS_TOKEN);
 const r=await fetch(u,{method:"POST"}),d=await r.json();if(!r.ok||!d.id)throw Error(d.error?.message||"فشل النشر على Facebook");return d.id
}
async function runAutomaticPost(env,scheduledTime){
 await ensureAutoSchema(env.DB);const setting=await env.DB.prepare("SELECT value FROM auto_settings WHERE key='enabled'").first();if(setting?.value!=="1")return;
 const slot=cairoSlot(new Date(scheduledTime));if(slot.minute!==0||![2,6,10,14,18,22].includes(slot.hour))return;
 try{await env.DB.prepare("INSERT INTO auto_runs (slot_key,status,message) VALUES (?,'running','بدأ تجهيز المنشور')").bind(slot.key).run()}catch(e){if(String(e.message||e).toLowerCase().includes("unique"))return;throw e}
 let topic=null,category=null,postId=null;
 try{
  const old=await env.DB.prepare("SELECT topic FROM auto_topics ORDER BY id DESC LIMIT 30").all(),used=new Set((old.results||[]).map(x=>x.topic)),pool=TOPICS.filter(x=>!used.has(x[1])),choice=(pool.length?pool:TOPICS)[Math.floor(Math.random()*(pool.length||TOPICS.length))];
  [category,topic]=choice;const content=await generateAutoContent(env,topic,category);
  const saved=await env.DB.prepare("INSERT INTO posts (content,post_type,status) VALUES (?,?,'draft')").bind(content,category).run();postId=saved.meta.last_row_id;
  const fbId=await publishToFacebook(env,content);
  await env.DB.prepare("UPDATE posts SET status='published',facebook_post_id=?,published_at=CURRENT_TIMESTAMP WHERE id=?").bind(fbId,postId).run();
  await env.DB.prepare("INSERT OR IGNORE INTO auto_topics (topic,category) VALUES (?,?)").bind(topic,category).run();
  await env.DB.prepare("INSERT INTO publish_logs (post_id,result,message) VALUES (?,'success',?)").bind(postId,fbId).run();
  await env.DB.prepare("UPDATE auto_runs SET status='success',post_id=?,topic=?,message=? WHERE slot_key=?").bind(postId,topic,"تم النشر: "+fbId,slot.key).run();
 }catch(e){const msg=String(e.message||e).slice(0,900);await env.DB.prepare("INSERT INTO publish_logs (post_id,result,message) VALUES (?,'failed',?)").bind(postId,msg).run();await env.DB.prepare("UPDATE auto_runs SET status='failed',post_id=?,topic=?,message=? WHERE slot_key=?").bind(postId,topic,msg,slot.key).run();throw e}
}

export default {
 async scheduled(event,env,ctx){ctx.waitUntil(runAutomaticPost(env,event.scheduledTime))},
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==="/"&&request.method==="GET")return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8"}});
  if(!url.pathname.startsWith("/api/"))return new Response("Not Found",{status:404});
  if(!env.ADMIN_KEY||request.headers.get("Authorization")!=="Bearer "+env.ADMIN_KEY)return json({ok:false,error:"مفتاح الإدارة غير صحيح"},401);
  if(!env.DB)return json({ok:false,error:"قاعدة البيانات DB غير مربوطة"},500);

  if(url.pathname==="/api/status"&&request.method==="GET"){try{if(!env.PAGE_ACCESS_TOKEN)throw Error("PAGE_ACCESS_TOKEN غير موجود");const u=new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}`);u.searchParams.set("fields","id,name");u.searchParams.set("access_token",env.PAGE_ACCESS_TOKEN);const r=await fetch(u),d=await r.json();if(!r.ok)return json({ok:false,error:d.error?.message||"Facebook API error"},400);return json({ok:true,page:d.name,id:d.id})}catch(e){return json({ok:false,error:e.message},500)}}

  if(url.pathname==="/api/stats"&&request.method==="GET"){try{const x=await env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) drafts,SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published FROM posts").first();return json({ok:true,total:x?.total||0,drafts:x?.drafts||0,published:x?.published||0})}catch(e){return json({ok:false,error:e.message},500)}}

  if(url.pathname==="/api/auto/status"&&request.method==="GET"){try{await ensureAutoSchema(env.DB);const s=await env.DB.prepare("SELECT value FROM auto_settings WHERE key='enabled'").first(),logs=await env.DB.prepare("SELECT status,topic,message,created_at FROM auto_runs ORDER BY id DESC LIMIT 10").all();return json({ok:true,enabled:s?.value==="1",logs:logs.results||[],nextRun:nextCairoRun()})}catch(e){return json({ok:false,error:e.message},500)}}
  if(url.pathname==="/api/auto/toggle"&&request.method==="POST"){try{await ensureAutoSchema(env.DB);const b=await request.json(),v=b.enabled===true?"1":"0";await env.DB.prepare("UPDATE auto_settings SET value=? WHERE key='enabled'").bind(v).run();return json({ok:true,enabled:v==="1"})}catch(e){return json({ok:false,error:e.message},500)}}

  if(url.pathname==="/api/generate"&&request.method==="POST"){try{
   if(!env.GEMINI_API_KEY)throw Error("GEMINI_API_KEY غير موجود");const b=await request.json(),topic=String(b.topic||"").trim().slice(0,300),category=String(b.category||"محتوى ثقافي").slice(0,100),length=String(b.length||"400 إلى 600 كلمة"),extra=String(b.extra||"").slice(0,500);if(!topic)return json({ok:false,error:"اكتب موضوع المنشور"},400);
   const prompt=`اكتب مقالاً عربياً لصفحة أقوال. الموضوع: ${topic}. التصنيف: ${category}. الطول: ${length}. تعليمات: ${extra||"لا توجد"}. ابدأ بعنوان جذاب ومقدمة مشوقة وسرد مترابط وخاتمة تفاعلية. لا تختلق تواريخ أو اقتباسات أو مصادر. استخدم العربية الفصحى المبسطة وأخرج المقال فقط.`;
   const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+GEMINI_MODEL+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},body:JSON.stringify({systemInstruction:{parts:[{text:"أنت محرر تاريخي وثقافي محترف والدقة أهم من الإثارة."}]},contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:.75,maxOutputTokens:2500}})}),d=await r.json();if(!r.ok)throw Error(d.error?.message||"فشل Gemini");const content=(d.candidates?.[0]?.content?.parts||[]).map(x=>x.text||"").join("").trim();if(!content)throw Error("لم يرجع Gemini نصاً");const saved=await env.DB.prepare("INSERT INTO posts (content,post_type,status) VALUES (?,?,'draft')").bind(content,category).run();return json({ok:true,id:saved.meta.last_row_id,content})
  }catch(e){return json({ok:false,error:e.message},500)}}

  if(url.pathname==="/api/save-draft"&&request.method==="POST"){try{const b=await request.json(),content=String(b.content||"").trim(),category=String(b.category||"محتوى");if(!content)return json({ok:false,error:"المحتوى فارغ"},400);const x=await env.DB.prepare("INSERT INTO posts (content,post_type,status) VALUES (?,?,'draft')").bind(content,category).run();return json({ok:true,id:x.meta.last_row_id})}catch(e){return json({ok:false,error:e.message},500)}}
  if(url.pathname==="/api/drafts"&&request.method==="GET"){try{const x=await env.DB.prepare("SELECT id,content,post_type,created_at FROM posts WHERE status='draft' ORDER BY id DESC LIMIT 50").all();return json({ok:true,items:x.results||[]})}catch(e){return json({ok:false,error:e.message},500)}}
  if(url.pathname==="/api/delete-draft"&&request.method==="POST"){try{const id=Number((await request.json()).id);if(!Number.isInteger(id)||id<1)return json({ok:false,error:"رقم المسودة غير صحيح"},400);const x=await env.DB.prepare("DELETE FROM posts WHERE id=? AND status='draft'").bind(id).run();if(!x.meta.changes)return json({ok:false,error:"المسودة غير موجودة"},404);return json({ok:true})}catch(e){return json({ok:false,error:e.message},500)}}
  if(url.pathname==="/api/publish-draft"&&request.method==="POST"){try{const id=Number((await request.json()).id),p=await env.DB.prepare("SELECT id,content,status FROM posts WHERE id=?").bind(id).first();if(!p||p.status!=="draft")return json({ok:false,error:"المسودة غير موجودة أو سبق نشرها"},404);const fb=await publishToFacebook(env,p.content);await env.DB.prepare("UPDATE posts SET status='published',facebook_post_id=?,published_at=CURRENT_TIMESTAMP WHERE id=?").bind(fb,id).run();await env.DB.prepare("INSERT INTO publish_logs (post_id,result,message) VALUES (?,'success',?)").bind(id,fb).run();return json({ok:true,id:fb})}catch(e){return json({ok:false,error:e.message},500)}}
  if(url.pathname==="/api/publish"&&request.method==="POST"){try{const message=String((await request.json()).message||"").trim();if(!message)return json({ok:false,error:"نص المنشور فارغ"},400);const fb=await publishToFacebook(env,message);await env.DB.prepare("INSERT INTO posts (content,status,facebook_post_id,published_at) VALUES (?,'published',?,CURRENT_TIMESTAMP)").bind(message,fb).run();await env.DB.prepare("INSERT INTO publish_logs (result,message) VALUES ('success',?)").bind(fb).run();return json({ok:true,id:fb})}catch(e){return json({ok:false,error:e.message},500)}}
  return new Response("Not Found",{status:404});
 }
};
