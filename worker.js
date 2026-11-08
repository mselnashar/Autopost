
const PAGE_ID = "282216368809712";
const GRAPH_VERSION = "v27.0";
const GEMINI_MODEL = "gemini-3.8-flash";

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#302052">
<title>أقوال | مركز إدارة المحتوى</title>
<style>
:root{
 --primary:#6845a3;--dark:#302052;--light:#f6f3fb;
 --text:#29243b;--muted:#89839a;--border:#ebe7f1;
 --green:#198754;--red:#c33c54;--white:#fff;
}
*{box-sizing:border-box}
body{margin:0;background:var(--light);color:var(--text);
 font-family:Arial,Tahoma,sans-serif;line-height:1.7}
button,input,textarea,select{font:inherit}
button{cursor:pointer;border:0}
.top{
 background:linear-gradient(135deg,#302052,#67439c);
 color:white;padding:25px 20px 30px;
}
.top-inner{max-width:1050px;margin:auto}
.brand{display:flex;align-items:center;gap:13px}
.logo{width:48px;height:48px;border-radius:15px;
 background:#ffffff20;display:grid;place-items:center;
 font-size:26px;font-weight:bold}
.brand h1{margin:0;font-size:26px}
.brand p{margin:2px 0;color:#ddd1f1;font-size:13px}
.top-desc{margin-top:20px;color:#e7def3;font-size:14px}
main{max-width:1050px;margin:auto;padding:18px}
.card{
 background:white;border:1px solid var(--border);
 border-radius:19px;padding:20px;margin-bottom:17px;
 box-shadow:0 5px 22px #35205c08
}
.card-title{display:flex;justify-content:space-between;
 align-items:center;gap:10px;margin-bottom:17px}
.card-title h2{font-size:18px;margin:0}
.muted{color:var(--muted);font-size:13px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.stat{background:#f8f6fb;border:1px solid var(--border);
 border-radius:15px;padding:15px}
.stat-label{font-size:12px;color:var(--muted)}
.stat-value{font-size:27px;font-weight:bold;color:var(--dark);margin-top:5px}
.status{background:#f2edf9;padding:12px 14px;
 border-radius:12px;font-size:14px;margin:10px 0}
.status.ok{background:#eaf7ef;color:#176c3d}
.status.err{background:#fff0f1;color:#a32d42}
.field{margin:13px 0}
label{display:block;font-size:13px;font-weight:bold;margin-bottom:6px}
input,textarea,select{
 width:100%;padding:13px 14px;border:1px solid #ded9e7;
 border-radius:12px;background:#fff;color:var(--text);
 outline:none
}
input:focus,textarea:focus,select:focus{
 border-color:var(--primary);box-shadow:0 0 0 3px #6845a318
}
textarea{min-height:300px;resize:vertical;line-height:1.9}
button.primary{
 background:var(--primary);color:white;padding:12px 19px;
 border-radius:12px;font-weight:bold
}
button.secondary{
 background:#f0ecf6;color:var(--dark);padding:11px 16px;
 border-radius:12px
}
button.danger{
 background:#fff0f1;color:#a32d42;padding:10px 14px;
 border-radius:10px
}
button:disabled{opacity:.55;cursor:wait}
.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}
.grid-editor{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.preview{
 background:#fcfbfe;border:1px solid var(--border);
 border-radius:14px;padding:18px;min-height:300px;
 white-space:pre-wrap;line-height:2;overflow-wrap:anywhere
}
.preview-title{font-weight:bold;font-size:17px;margin-bottom:12px}
.post{
 border:1px solid var(--border);border-radius:14px;
 padding:15px;margin:12px 0
}
.post-head{display:flex;justify-content:space-between;
 gap:8px;align-items:center;flex-wrap:wrap}
.post-content{white-space:pre-wrap;line-height:1.9;
 margin:12px 0;overflow-wrap:anywhere}
.tag{background:#f0ecf8;color:#63428d;padding:4px 9px;
 border-radius:20px;font-size:11px}
.empty{text-align:center;padding:30px;color:var(--muted)}
.footer{text-align:center;color:var(--muted);font-size:12px;padding:20px}
.small-btn{padding:8px 11px;border-radius:9px;
 background:#f0ecf6;color:var(--dark);font-size:13px}
hr{border:0;border-top:1px solid var(--border);margin:18px 0}
@media(max-width:650px){
 main{padding:12px}
 .card{padding:16px;border-radius:16px}
 .stats{gap:7px}
 .stat{padding:10px}
 .stat-value{font-size:22px}
 .grid-editor{grid-template-columns:1fr}
 textarea{min-height:260px}
 .top{padding:21px 17px}
}
</style>
</head>
<body>

<header class="top">
 <div class="top-inner">
  <div class="brand">
   <div class="logo">ق</div>
   <div>
    <h1>أقوال</h1>
    <p>مركز إدارة المحتوى والنشر الذكي</p>
   </div>
  </div>
  <div class="top-desc">
   إدارة القصص والثقافة والتاريخ وصناعة محتوى الصفحة
  </div>
 </div>
</header>

<main>

<section class="card">
 <div class="card-title">
  <h2>لوحة التحكم</h2>
  <span class="tag">الرئيسية</span>
 </div>
 <div class="stats">
  <div class="stat">
   <div class="stat-label">إجمالي المنشورات</div>
   <div class="stat-value" id="total">—</div>
  </div>
  <div class="stat">
   <div class="stat-label">المسودات</div>
   <div class="stat-value" id="draftCount">—</div>
  </div>
  <div class="stat">
   <div class="stat-label">المنشورات المنشورة</div>
   <div class="stat-value" id="publishedCount">—</div>
  </div>
 </div>
 <div class="status" id="connection">أدخل مفتاح الإدارة لفحص الاتصال</div>
 <div class="field">
  <label>مفتاح إدارة البوت</label>
  <input id="admin" type="password" placeholder="ADMIN_KEY">
 </div>
 <div class="actions">
  <button class="primary" onclick="checkConnection()">فحص الاتصال</button>
  <button class="secondary" onclick="refreshAll()">تحديث البيانات</button>
 </div>
</section>

<section class="card">
 <div class="card-title">
  <h2>إنشاء محتوى جديد</h2>
  <span class="tag">Gemini AI</span>
 </div>

 <div class="field">
  <label>موضوع المنشور</label>
  <input id="topic" placeholder="مثلاً: ابن سينا ورحلته في عالم الطب">
 </div>

 <div class="field">
  <label>تصنيف المحتوى</label>
  <select id="category">
   <option value="قصة تاريخية مصرية">تاريخ مصر</option>
   <option value="قصة تاريخية عربية">التاريخ العربي</option>
   <option value="قصة تاريخية عالمية">التاريخ العالمي</option>
   <option value="شخصية تاريخية">شخصيات تاريخية</option>
   <option value="معلومة ثقافية">ثقافة ومعرفة</option>
   <option value="قصة إنسانية">قصص إنسانية</option>
   <option value="حكمة أو قول مأثور">أقوال وحكم</option>
   <option value="نص فيديو ريلز قصير">سيناريو Reels</option>
  </select>
 </div>

 <div class="field">
  <label>حجم المحتوى</label>
  <select id="length">
   <option value="400 إلى 600 كلمة">مقال متوسط (400–600 كلمة)</option>
   <option value="600 إلى 800 كلمة">مقال طويل (600–800 كلمة)</option>
   <option value="200 إلى 300 كلمة">منشور مختصر (200–300 كلمة)</option>
   <option value="100 إلى 150 كلمة">نص قصير (100–150 كلمة)</option>
  </select>
 </div>

 <div class="field">
  <label>تعليمات إضافية (اختياري)</label>
  <input id="extra" placeholder="مثلاً: ركز على طفولته وإنجازاته العلمية">
 </div>

 <button class="primary" id="generateBtn" onclick="generate()" style="width:100%">
  إنشاء المحتوى بالذكاء الاصطناعي
 </button>
 <div class="status" id="aiStatus">اكتب الموضوع وحدد نوع المحتوى ثم ابدأ.</div>
</section>

<section class="card">
 <div class="card-title">
  <h2>محرر المنشورات</h2>
  <span class="tag">معاينة وتعديل</span>
 </div>
 <div class="grid-editor">
  <div>
   <label>نص المنشور</label>
   <textarea id="message" placeholder="سيظهر المحتوى الذي تم إنشاؤه هنا..."></textarea>
   <div class="actions">
    <button class="primary" onclick="saveDraft()">حفظ كمسودة</button>
    <button class="secondary" onclick="copyText()">نسخ النص</button>
    <button class="secondary" onclick="clearEditor()">مسح المحرر</button>
   </div>
  </div>
  <div>
   <label>معاينة المنشور</label>
   <div class="preview" id="preview">ستظهر المعاينة هنا أثناء الكتابة.</div>
   <div class="muted" id="wordCount">0 كلمة</div>
  </div>
 </div>
</section>

<section class="card">
 <div class="card-title">
  <h2>المسودات المحفوظة</h2>
  <button class="secondary" onclick="loadDrafts()">تحديث</button>
 </div>
 <div id="drafts"><div class="empty">اضغط تحديث لعرض المسودات.</div></div>
</section>

<section class="card">
 <div class="card-title">
  <h2>النشر المباشر</h2>
  <span class="tag">Facebook</span>
 </div>
 <p class="muted">راجع النص قبل النشر. النشر هنا يتم مباشرة على صفحة أقوال.</p>
 <button class="primary" onclick="publishText()">نشر المنشور الحالي</button>
 <div class="status" id="publishStatus">لم يتم النشر بعد.</div>
</section>

<div class="footer">
 أقوال © مركز إدارة المحتوى والنشر الذكي
</div>
</main>

<script>
const $=id=>document.getElementById(id);

async function call(path,method="GET",body=null){
 const key=$("admin").value.trim();
 if(!key) throw new Error("أدخل مفتاح الإدارة أولاً");
 const r=await fetch(path,{
  method,
  headers:{
   "Authorization":"Bearer "+key,
   "Content-Type":"application/json"
  },
  body:body?JSON.stringify(body):undefined
 });
 const d=await r.json();
 if(!r.ok) throw new Error(d.error||"حدث خطأ");
 return d;
}

function setStatus(id,message,type=""){
 const el=$(id);
 el.textContent=message;
 el.className="status "+type;
}

function updatePreview(){
 const value=$("message").value;
 $("preview").textContent=value||"ستظهر المعاينة هنا أثناء الكتابة.";
 const count=value.trim()?value.trim().split(/\\s+/).length:0;
 $("wordCount").textContent=count+" كلمة";
}
$("message").addEventListener("input",updatePreview);

async function checkConnection(){
 setStatus("connection","جاري فحص الاتصال...");
 try{
  const d=await call("/api/status");
  setStatus("connection","متصل بصفحة "+d.page,"ok");
 }catch(e){
  setStatus("connection",e.message,"err");
 }
}

async function loadStats(){
 try{
  const d=await call("/api/stats");
  $("total").textContent=d.total;
  $("draftCount").textContent=d.drafts;
  $("publishedCount").textContent=d.published;
 }catch(e){
  $("total").textContent="—";
  $("draftCount").textContent="—";
  $("publishedCount").textContent="—";
 }
}

async function refreshAll(){
 await checkConnection();
 await loadStats();
 await loadDrafts();
}

async function generate(){
 const topic=$("topic").value.trim();
 if(!topic){
  setStatus("aiStatus","اكتب موضوع المنشور أولاً","err");
  return;
 }
 const btn=$("generateBtn");
 btn.disabled=true;
 btn.textContent="جاري إعداد المقال...";
 setStatus("aiStatus","Gemini يكتب المحتوى ويجهز المسودة...");
 try{
  const d=await call("/api/generate","POST",{
   topic,
   category:$("category").value,
   length:$("length").value,
   extra:$("extra").value.trim()
  });
  $("message").value=d.content;
  updatePreview();
  setStatus("aiStatus","تم إنشاء المسودة وحفظها بنجاح. رقمها "+d.id,"ok");
  await loadDrafts();
  await loadStats();
 }catch(e){
  setStatus("aiStatus","تعذر إنشاء المحتوى: "+e.message,"err");
 }finally{
  btn.disabled=false;
  btn.textContent="إنشاء المحتوى بالذكاء الاصطناعي";
 }
}

async function loadDrafts(){
 const box=$("drafts");
 box.textContent="جاري تحميل المسودات...";
 try{
  const d=await call("/api/drafts");
  box.replaceChildren();
  if(!d.items.length){
   box.textContent="لا توجد مسودات حالياً";
   return;
  }
  d.items.forEach(p=>{
   const card=document.createElement("div");
   card.className="post";

   const head=document.createElement("div");
   head.className="post-head";

   const title=document.createElement("strong");
   title.textContent="مسودة رقم "+p.id;

   const tag=document.createElement("span");
   tag.className="tag";
   tag.textContent=p.post_type||"محتوى";

   head.append(title,tag);

   const content=document.createElement("div");
   content.className="post-content";
   content.textContent=p.content;

   const info=document.createElement("div");
   info.className="muted";
   info.textContent="تاريخ الحفظ: "+(p.created_at||"غير محدد");

   const actions=document.createElement("div");
   actions.className="actions";

   const edit=document.createElement("button");
   edit.className="secondary";
   edit.textContent="تعديل";
   edit.onclick=()=>{
    $("message").value=p.content;
    updatePreview();
    window.scrollTo({top:$("message").getBoundingClientRect().top+window.scrollY-100,behavior:"smooth"});
   };

   const publish=document.createElement("button");
   publish.className="primary";
   publish.textContent="نشر";
   publish.onclick=()=>publishDraft(p.id);

   const del=document.createElement("button");
   del.className="danger";
   del.textContent="حذف";
   del.onclick=()=>deleteDraft(p.id);

   actions.append(edit,publish,del);
   card.append(head,content,info,actions);
   box.append(card);
  });
 }catch(e){
  box.textContent="تعذر تحميل المسودات: "+e.message;
 }
}

async function saveDraft(){
 const content=$("message").value.trim();
 if(!content){
  alert("لا يوجد محتوى لحفظه");
  return;
 }
 try{
  const d=await call("/api/save-draft","POST",{
   content,
   category:$("category").value
  });
  setStatus("aiStatus","تم حفظ المسودة رقم "+d.id,"ok");
  await loadDrafts();
  await loadStats();
 }catch(e){
  setStatus("aiStatus","فشل الحفظ: "+e.message,"err");
 }
}

async function deleteDraft(id){
 if(!confirm("هل تريد حذف هذه المسودة نهائياً؟"))return;
 try{
  await call("/api/delete-draft","POST",{id});
  await loadDrafts();
  await loadStats();
 }catch(e){alert(e.message);}
}

async function publishDraft(id){
 if(!confirm("هل تريد نشر هذه المسودة على صفحة Facebook؟"))return;
 try{
  const d=await call("/api/publish-draft","POST",{id});
  alert("تم النشر بنجاح: "+d.id);
  await loadDrafts();
  await loadStats();
 }catch(e){alert("فشل النشر: "+e.message);}
}

async function publishText(){
 const message=$("message").value.trim();
 if(!message){
  setStatus("publishStatus","اكتب المنشور أولاً","err");
  return;
 }
 if(!confirm("تأكيد النشر الفعلي على صفحة أقوال؟"))return;
 setStatus("publishStatus","جاري النشر...");
 try{
  const d=await call("/api/publish","POST",{message});
  setStatus("publishStatus","تم النشر بنجاح. رقم المنشور: "+d.id,"ok");
  await loadStats();
 }catch(e){
  setStatus("publishStatus","فشل النشر: "+e.message,"err");
 }
}

async function copyText(){
 const value=$("message").value;
 if(!value){alert("لا يوجد نص لنسخه");return;}
 try{
  await navigator.clipboard.writeText(value);
  alert("تم نسخ النص");
 }catch(e){
  $("message").select();
  alert("حدد النص وانسخه يدوياً");
 }
}

function clearEditor(){
 if(!confirm("مسح النص الموجود في المحرر؟"))return;
 $("message").value="";
 updatePreview();
}

updatePreview();
</script>
</body>
</html>`;

function json(data,status=200){
 return Response.json(data,{status});
}

export default {
 async fetch(request,env){
  const url=new URL(request.url);

  if(url.pathname==="/" && request.method==="GET"){
   return new Response(html,{
    headers:{"Content-Type":"text/html; charset=utf-8"}
   });
  }

  if(!url.pathname.startsWith("/api/")){
   return new Response("Not Found",{status:404});
  }

  const auth=request.headers.get("Authorization");
  if(!env.ADMIN_KEY || auth!=="Bearer "+env.ADMIN_KEY){
   return json({ok:false,error:"مفتاح الإدارة غير صحيح"},401);
  }

  if(!env.DB){
   return json({ok:false,error:"قاعدة البيانات DB غير مربوطة"},500);
  }

  // Facebook connection
  if(url.pathname==="/api/status" && request.method==="GET"){
   try{
    if(!env.PAGE_ACCESS_TOKEN) throw new Error("PAGE_ACCESS_TOKEN غير موجود");
    const u=new URL("https://graph.facebook.com/"+GRAPH_VERSION+"/"+PAGE_ID);
    u.searchParams.set("fields","id,name");
    u.searchParams.set("access_token",env.PAGE_ACCESS_TOKEN);
    const r=await fetch(u);
    const d=await r.json();
    if(!r.ok) return json({ok:false,error:d.error?.message||"Facebook API error"});
    return json({ok:true,page:d.name,id:d.id});
   }catch(e){
    return json({ok:false,error:e.message},500);
   }
  }

  // Dashboard statistics
  if(url.pathname==="/api/stats" && request.method==="GET"){
   try{
    const row=await env.DB.prepare(
     "SELECT COUNT(*) AS total,"+
     "SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS drafts,"+
     "SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published "+
     "FROM posts"
    ).first();
    return json({
     ok:true,
     total:row?.total||0,
     drafts:row?.drafts||0,
     published:row?.published||0
    });
   }catch(e){return json({ok:false,error:e.message},500);}
  }

  // Generate content using Gemini
  if(url.pathname==="/api/generate" && request.method==="POST"){
   try{
    if(!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY غير موجود");

    const body=await request.json();
    const topic=String(body.topic||"").trim().slice(0,300);
    const category=String(body.category||"محتوى ثقافي").slice(0,100);
    const length=String(body.length||"400 إلى 600 كلمة").slice(0,50);
    const extra=String(body.extra||"").slice(0,500);

    if(!topic) return json({ok:false,error:"اكتب موضوع المنشور"},400);

    const prompt=`
أنت رئيس تحرير صفحة أقوال العربية المتخصصة في التاريخ والثقافة والقصص الإنسانية.

الموضوع: ${topic}
التصنيف: ${category}
الطول المطلوب: ${length}
تعليمات إضافية: ${extra||"لا توجد"}

اكتب مقالاً عربياً متكاملاً وفق القواعد التالية:

1. ابدأ بعنوان قوي وجذاب يثير الفضول دون تضليل.
2. اكتب مقدمة أدبية تشد القارئ.
3. قدم خلفية تاريخية وسياقاً واضحاً للموضوع.
4. استخدم سرداً قصصياً متسلسلاً ومترابطاً.
5. أضف تفاصيل وأمثلة ومعلومات ذات قيمة.
6. اشرح أثر الشخصية أو الحدث في التاريخ.
7. اختم بخلاصة وسؤال تفاعلي مناسب.
8. التزم بالطول المطلوب فعلياً، ولا تختصر المقال.
9. لا تكرر الأفكار لزيادة عدد الكلمات.
10. لا تختلق أحداثاً أو تواريخ أو اقتباسات.
11. لا تنسب قولاً إلى شخصية تاريخية دون تحقق.
12. إذا كانت هناك روايات تاريخية متعارضة فوضح ذلك.
13. استخدم العربية الفصحى المبسطة.
14. لا تستخدم علامات Markdown مثل النجوم أو علامات العناوين.
15. لا تكتب معلومات وهمية أو مصادر مختلقة.
16. أخرج المقال النهائي فقط.

يجب أن يكون النص مناسباً للنشر على صفحة Facebook ثقافية.
`;

    const ai=await fetch(
     "https://generativelanguage.googleapis.com/v1beta/models/"+
     GEMINI_MODEL+":generateContent",
     {
      method:"POST",
      headers:{
       "Content-Type":"application/json",
       "x-goog-api-key":env.GEMINI_API_KEY
      },
      body:JSON.stringify({
       systemInstruction:{
        parts:[{
         text:"أنت محرر تاريخي وثقافي محترف. الدقة أهم من الإثارة."
        }]
       },
       contents:[{role:"user",parts:[{text:prompt}]}],
       generationConfig:{
        temperature:0.75,
        maxOutputTokens:2500
       }
      })
     }
    );

    const result=await ai.json();
    if(!ai.ok){
     throw new Error(result.error?.message||"فشل الاتصال بـ Gemini");
    }

    const content=(result.candidates?.[0]?.content?.parts||[])
     .map(part=>part.text||"").join("").trim();

    if(!content){
     throw new Error("لم يرجع Gemini نصاً كاملاً");
    }

    const saved=await env.DB.prepare(
     "INSERT INTO posts (content,post_type,status) VALUES (?,?,'draft')"
    ).bind(content,category).run();

    return json({
     ok:true,
     id:saved.meta.last_row_id,
     content
    });

   }catch(e){
    return json({ok:false,error:e.message},500);
   }
  }

  // Save edited draft
  if(url.pathname==="/api/save-draft" && request.method==="POST"){
   try{
    const body=await request.json();
    const content=String(body.content||"").trim();
    const category=String(body.category||"محتوى").slice(0,100);
    if(!content) return json({ok:false,error:"المحتوى فارغ"},400);

    const saved=await env.DB.prepare(
     "INSERT INTO posts (content,post_type,status) VALUES (?,?,'draft')"
    ).bind(content,category).run();

    return json({ok:true,id:saved.meta.last_row_id});
   }catch(e){return json({ok:false,error:e.message},500);}
  }

  // List drafts
  if(url.pathname==="/api/drafts" && request.method==="GET"){
   try{
    const result=await env.DB.prepare(
     "SELECT id,content,post_type,created_at FROM posts "+
     "WHERE status='draft' ORDER BY id DESC LIMIT 50"
    ).all();
    return json({ok:true,items:result.results||[]});
   }catch(e){return json({ok:false,error:e.message},500);}
  }

  // Delete draft only
  if(url.pathname==="/api/delete-draft" && request.method==="POST"){
   try{
    const body=await request.json();
    const id=Number(body.id);
    if(!Number.isInteger(id)||id<1){
     return json({ok:false,error:"رقم المسودة غير صحيح"},400);
    }
    const result=await env.DB.prepare(
     "DELETE FROM posts WHERE id=? AND status='draft'"
    ).bind(id).run();
    if(!result.meta.changes){
     return json({ok:false,error:"المسودة غير موجودة"},404);
    }
    return json({ok:true});
   }catch(e){return json({ok:false,error:e.message},500);}
  }

  // Publish saved draft
  if(url.pathname==="/api/publish-draft" && request.method==="POST"){
   try{
    const body=await request.json();
    const id=Number(body.id);
    if(!Number.isInteger(id)||id<1){
     return json({ok:false,error:"رقم المسودة غير صحيح"},400);
    }

    const post=await env.DB.prepare(
     "SELECT id,content,status FROM posts WHERE id=?"
    ).bind(id).first();

    if(!post||post.status!=="draft"){
     return json({ok:false,error:"المسودة غير موجودة أو سبق نشرها"},404);
    }

    const u=new URL("https://graph.facebook.com/"+GRAPH_VERSION+"/"+PAGE_ID+"/feed");
    u.searchParams.set("message",post.content);
    u.searchParams.set("access_token",env.PAGE_ACCESS_TOKEN);

    const r=await fetch(u,{method:"POST"});
    const d=await r.json();

    if(!r.ok){
     await env.DB.prepare(
      "INSERT INTO publish_logs (post_id,result,message) VALUES (?, 'failed',?)"
     ).bind(id,d.error?.message||"Facebook error").run();
     return json({ok:false,error:d.error?.message||"فشل النشر"},400);
    }

    await env.DB.prepare(
     "UPDATE posts SET status='published',facebook_post_id=?,"+
     "published_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(d.id,id).run();

    await env.DB.prepare(
     "INSERT INTO publish_logs (post_id,result,message) VALUES (?, 'success',?)"
    ).bind(id,d.id).run();

    return json({ok:true,id:d.id});
   }catch(e){return json({ok:false,error:e.message},500);}
  }

  // Direct publishing
  if(url.pathname==="/api/publish" && request.method==="POST"){
   try{
    const body=await request.json();
    const message=String(body.message||"").trim();
    if(!message) return json({ok:false,error:"نص المنشور فارغ"},400);

    const u=new URL("https://graph.facebook.com/"+GRAPH_VERSION+"/"+PAGE_ID+"/feed");
    u.searchParams.set("message",message);
    u.searchParams.set("access_token",env.PAGE_ACCESS_TOKEN);

    const r=await fetch(u,{method:"POST"});
    const d=await r.json();

    if(!r.ok){
     return json({ok:false,error:d.error?.message||"فشل النشر"},400);
    }

    await env.DB.prepare(
     "INSERT INTO posts (content,status,facebook_post_id,published_at) "+
     "VALUES (?, 'published',?,CURRENT_TIMESTAMP)"
    ).bind(message,d.id).run();

    await env.DB.prepare(
     "INSERT INTO publish_logs (result,message) VALUES ('success',?)"
    ).bind(d.id).run();

    return json({ok:true,id:d.id});
   }catch(e){return json({ok:false,error:e.message},500);}
  }

  return new Response("Not Found",{status:404});
 }
};
 
