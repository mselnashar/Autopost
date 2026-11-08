
const PAGE_ID = "282216368809712";
const GRAPH_VERSION = "v27.0";
const AI_MODEL = "gpt-4.1-mini";

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>مدير أقوال</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#f5f3fa;color:#29243b;font-family:Arial}
header{background:#38245f;color:white;padding:25px 18px}
header h1{margin:0 0 8px;font-size:28px}
main{max-width:720px;margin:auto;padding:14px}
.card{background:white;padding:18px;border-radius:16px;margin:14px 0;box-shadow:0 3px 14px #0000000c}
h2{font-size:19px;margin-top:0}
input,textarea,select{width:100%;padding:13px;border:1px solid #ddd;border-radius:10px;margin:8px 0;font-size:16px}
textarea{min-height:120px}
button{border:0;border-radius:10px;padding:13px 17px;background:#6845a3;color:white;font-size:15px;margin:5px;cursor:pointer}
.secondary{background:#eee;color:#38245f}
.status{padding:12px;border-radius:10px;background:#f1edf8;margin:10px 0}
.post{border:1px solid #eee;border-radius:12px;padding:13px;margin:12px 0;white-space:pre-wrap;line-height:1.7}
small{color:#777}
</style>
</head>
<body>
<header>
<h1>أقوال</h1>
<div>مركز إدارة المحتوى والنشر الذكي</div>
</header>
<main>
<div class="card">
<h2>حالة الاتصال</h2>
<div class="status" id="status">لم يتم الفحص بعد</div>
<button onclick="check()">فحص اتصال Facebook</button>
</div>

<div class="card">
<h2>إنشاء محتوى بالذكاء الاصطناعي</h2>
<input id="topic" placeholder="مثلاً: قصة من تاريخ مصر القديم">
<select id="category">
<option value="قصة تاريخية مصرية">قصة تاريخية مصرية</option>
<option value="قصة تاريخية عربية">قصة تاريخية عربية</option>
<option value="قصة تاريخية عالمية">قصة تاريخية عالمية</option>
<option value="معلومة ثقافية">معلومة ثقافية</option>
<option value="شخصية تاريخية">شخصية تاريخية</option>
<option value="حكمة أو قول مأثور">حكمة أو قول مأثور</option>
<option value="نص فيديو ريلز قصير">نص فيديو Reels</option>
</select>
<button onclick="generate()">إنشاء منشور وحفظه</button>
<div id="airesult"></div>
</div>

<div class="card">
<h2>المسودات المحفوظة</h2>
<button class="secondary" onclick="loadDrafts()">تحديث المسودات</button>
<div id="drafts">اضغط تحديث المسودات لعرض المحتوى.</div>
</div>

<div class="card">
<h2>نشر مباشر</h2>
<textarea id="message" placeholder="اكتب المنشور الذي تريد نشره..."></textarea>
<button onclick="publishText()">نشر على صفحة أقوال</button>
<div id="publishResult"></div>
</div>

<div class="card">
<h2>إعدادات الإدارة</h2>
<input id="admin" type="password" placeholder="مفتاح إدارة البوت">
<small>المفتاح محفوظ في Cloudflare Secret باسم ADMIN_KEY.</small>
</div>

<div class="card">
<h2>خطة النشر</h2>
<div class="status">الهدف: 5 منشورات يومياً</div>
<div>9 صباحاً - 12 ظهراً - 3 عصراً - 6 مساءً - 9 مساءً</div>
<small>الجدولة التلقائية لم تُفعّل بعد.</small>
</div>
</main>
<script>
async function call(path,method="GET",body=null){
 const key=document.getElementById("admin").value;
 const r=await fetch(path,{
  method,
  headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
  body:body?JSON.stringify(body):undefined
 });
 const d=await r.json();
 if(!r.ok) throw new Error(d.error||"حدث خطأ");
 return d;
}
async function check(){
 const s=document.getElementById("status");
 s.textContent="جاري الفحص...";
 try{
  const d=await call("/api/status");
s.textContent=d.ok
 ? "متصل بصفحة "+d.page
 : "خطأ Facebook: "+(d.error||"سبب غير معروف");
 }catch(e){s.textContent=e.message;}
}
async function generate(){
 const topic=document.getElementById("topic").value.trim();
 const category=document.getElementById("category").value;
 const out=document.getElementById("airesult");
 if(!topic){out.textContent="اكتب موضوع المنشور أولاً";return;}
 out.textContent="الذكاء الاصطناعي يكتب المحتوى الآن...";
 try{
  const d=await call("/api/generate","POST",{topic,category});
  out.textContent="تم إنشاء المسودة وحفظها بنجاح.";
  document.getElementById("message").value=d.content;
  await loadDrafts();
 }catch(e){out.textContent="تعذر التوليد: "+e.message;}
}
async function loadDrafts(){
 const box=document.getElementById("drafts");
 box.textContent="جاري تحميل المسودات...";
 try{
  const d=await call("/api/drafts");
  box.innerHTML="";
  if(!d.items.length){box.textContent="لا توجد مسودات حالياً";return;}
  d.items.forEach(p=>{
   const div=document.createElement("div");
   div.className="post";
   const content=document.createElement("div");
   content.textContent=p.content;
   const info=document.createElement("small");
   info.textContent="مسودة رقم "+p.id+" - "+p.post_type;
   const edit=document.createElement("button");
   edit.textContent="تعديل في المحرر";
   edit.className="secondary";
   edit.onclick=()=>{document.getElementById("message").value=p.content;};
   const pub=document.createElement("button");
   pub.textContent="نشر هذه المسودة";
   pub.onclick=()=>publishDraft(p.id);
   div.append(info,content,edit,pub);
   box.appendChild(div);
  });
 }catch(e){box.textContent=e.message;}
}
async function publishDraft(id){
 if(!confirm("هل تريد نشر هذه المسودة على صفحة أقوال؟"))return;
 try{
  const d=await call("/api/publish-draft","POST",{id});
  alert("تم النشر بنجاح: "+d.id);
  await loadDrafts();
 }catch(e){alert("فشل النشر: "+e.message);}
}
async function publishText(){
 const message=document.getElementById("message").value.trim();
 if(!message){alert("اكتب نص المنشور");return;}
 if(!confirm("هل تريد نشر هذا المحتوى فعلياً؟"))return;
 const out=document.getElementById("publishResult");
 out.textContent="جاري النشر...";
 try{
  const d=await call("/api/publish","POST",{message});
  out.textContent="تم النشر بنجاح. رقم المنشور: "+d.id;
 }catch(e){out.textContent=e.message;}
}
</script>
</body>
</html>`;

function json(data,status=200){
 return Response.json(data,{status});
}

function getText(data){
 for(const item of data.output||[]){
  if(item.type==="message"){
   for(const c of item.content||[]){
    if(c.type==="output_text") return c.text;
   }
  }
 }
 return "";
}

export default {
 async fetch(request,env){
  const url=new URL(request.url);

  if(url.pathname==="/" && request.method==="GET"){
   return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8"}});
  }

  if(!url.pathname.startsWith("/api/")) return new Response("Not Found",{status:404});

  const auth=request.headers.get("Authorization");
  if(!env.ADMIN_KEY || auth!=="Bearer "+env.ADMIN_KEY){
   return json({ok:false,error:"مفتاح الإدارة غير صحيح"},401);
  }

  if(!env.DB) return json({ok:false,error:"قاعدة البيانات DB غير مربوطة"},500);

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
   }catch(e){return json({ok:false,error:e.message},500);}
  }

  if(url.pathname==="/api/generate" && request.method==="POST"){
   try{
    if(!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY غير موجود");
    const body=await request.json();
    const topic=String(body.topic||"").trim().slice(0,300);
    const category=String(body.category||"محتوى ثقافي").slice(0,100);
    if(!topic) return json({ok:false,error:"اكتب موضوع المنشور"},400);

    const prompt=
     "أنت محرر صفحة أقوال العربية المتخصصة في الثقافة والتاريخ والقصص. "+
     "اكتب منشوراً عربياً جذاباً وسلساً باللهجة العربية الفصحى المبسطة. "+
     "نوع المحتوى: "+category+". الموضوع: "+topic+". "+
     "اجعل النص مناسباً لفيسبوك، بعنوان جذاب وفقرات قصيرة. "+
     "لا تختلق تواريخ أو اقتباسات أو وقائع. إذا لم تكن متأكداً من معلومة تاريخية فلا تجزم بها. "+
     "لا تنسب قولاً لشخص دون تحقق. لا تضف مصادر وهمية. "+
     "أخرج نص المنشور فقط دون شرح لطريقة الكتابة.";

    const ai=await fetch("https://api.openai.com/v1/responses",{
     method:"POST",
     headers:{
      "Authorization":"Bearer "+env.OPENAI_API_KEY,
      "Content-Type":"application/json"
     },
     body:JSON.stringify({
      model:AI_MODEL,
      instructions:"أنت كاتب محتوى ثقافي وتاريخي دقيق. لا تخترع الحقائق.",
      input:prompt,
      max_output_tokens:700
     })
    });
    const result=await ai.json();
    if(!ai.ok) throw new Error(result.error?.message||"فشل الاتصال بالذكاء الاصطناعي");
    const content=getText(result).trim();
    if(!content) throw new Error("لم يرجع الذكاء الاصطناعي نصاً");

    const saved=await env.DB.prepare(
     "INSERT INTO posts (content,post_type,status) VALUES (?,?, 'draft')"
    ).bind(content,category).run();

    return json({ok:true,id:saved.meta.last_row_id,content});
   }catch(e){return json({ok:false,error:e.message},500);}
  }

  if(url.pathname==="/api/drafts" && request.method==="GET"){
   try{
    const result=await env.DB.prepare(
     "SELECT id,content,post_type,created_at FROM posts WHERE status='draft' ORDER BY id DESC LIMIT 30"
    ).all();
    return json({ok:true,items:result.results||[]});
   }catch(e){return json({ok:false,error:e.message},500);}
  }

  if(url.pathname==="/api/publish-draft" && request.method==="POST"){
   try{
    const body=await request.json();
    const id=Number(body.id);
    if(!Number.isInteger(id)||id<1) return json({ok:false,error:"رقم المسودة غير صحيح"},400);

    const post=await env.DB.prepare(
     "SELECT id,content,status FROM posts WHERE id=?"
    ).bind(id).first();

    if(!post) return json({ok:false,error:"المسودة غير موجودة"},404);
    if(post.status!=="draft") return json({ok:false,error:"هذه المسودة ليست في حالة مسودة"},409);

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
     "UPDATE posts SET status='published',facebook_post_id=?,published_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(d.id,id).run();

    await env.DB.prepare(
     "INSERT INTO publish_logs (post_id,result,message) VALUES (?, 'success',?)"
    ).bind(id,d.id).run();

    return json({ok:true,id:d.id});
   }catch(e){return json({ok:false,error:e.message},500);}
  }

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

    if(!r.ok) return json({ok:false,error:d.error?.message||"فشل النشر"},400);

    await env.DB.prepare(
     "INSERT INTO posts (content,status,facebook_post_id,published_at) VALUES (?, 'published',?,CURRENT_TIMESTAMP)"
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

