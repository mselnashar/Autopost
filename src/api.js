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

/* واجهات API */

import { GRAPH_VERSION, pageId, json, TOPICS, MAX_REEL_BYTES, cleanHtml, topicFromContent } from "./config.js";
import { ensurePostsSchema, ensurePublishLogsSchema, ensureAutoSchema } from "./db.js";
import { getHours, nextCairoRun } from "./time.js";
import { callGemini } from "./gemini.js";
import { generateAutoContent, generateArticle, cleanArticleHtml } from "./generation.js";
import { WIKI_UA, applyWikiUA, fetchWikiImage, requireImage, licenseOk, findTopicImage, saveImageToPost } from "./images.js";
import { publishPost, publishStoryBlob, publishReel, autoStoryEnabled } from "./facebook.js";
import { blogConfigured, getGoogleToken, getBlogId, getBlogHours, buildBlogHtml, publishBlogPost } from "./blog.js";
import { notifyReady } from "./notify.js";
import { autoDraftEnabled } from "./auto.js";
import { html } from "./dashboard.js";

export async function handleRequest(request, env) {
  applyWikiUA(env);
  const url = new URL(request.url);

  if (url.pathname === "/" && request.method === "GET") {
   return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
   });
  }

  if (!url.pathname.startsWith("/api/")) {
   return new Response("Not Found", { status: 404 });
  }

  if (!env.ADMIN_KEY) {
   return json({ ok: false, error: "ADMIN_KEY غير مضبوط على الخادم" }, 500);
  }

  if (request.headers.get("Authorization") !== "Bearer " + env.ADMIN_KEY) {
   return json({ ok: false, error: "مفتاح الإدارة غير صحيح" }, 401);
  }

  if (!env.DB) {
   return json({ ok: false, error: "قاعدة البيانات DB غير مربوطة" }, 500);
  }

  if (url.pathname === "/api/status" && request.method === "GET") {
   try {
    if (!env.PAGE_ACCESS_TOKEN) throw Error("PAGE_ACCESS_TOKEN غير موجود");

    const u = new URL(
     `https://graph.facebook.com/${GRAPH_VERSION}/${pageId(env)}`
    );

    u.searchParams.set("fields", "id,name");
    u.searchParams.set("access_token", env.PAGE_ACCESS_TOKEN);

    const r = await fetch(u);
    const d = await r.json();

    if (!r.ok) {
     return json({ ok: false, error: d.error?.message || "Facebook API error" }, 400);
    }

    return json({ ok: true, page: d.name, id: d.id, wikiContact: Boolean(env.WIKI_CONTACT) });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/stats" && request.method === "GET") {
   try {
    await ensurePostsSchema(env.DB);

    const x = await env.DB.prepare(
     "SELECT COUNT(*) total,SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) drafts,SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published FROM posts"
    ).first();

    return json({
     ok: true,
     total: x?.total || 0,
     drafts: x?.drafts || 0,
     published: x?.published || 0
    });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/auto/status" && request.method === "GET") {
   try {
    await ensureAutoSchema(env.DB);

    const s = await env.DB.prepare(
     "SELECT value FROM auto_settings WHERE key='enabled'"
    ).first();

    const logs = await env.DB.prepare(
     "SELECT status,topic,message,created_at FROM auto_runs ORDER BY id DESC LIMIT 10"
    ).all();

    const hours = await getHours(env);

    return json({
     ok: true,
     enabled: s?.value === "1",
     logs: logs.results || [],
     hours,
     blogHours: await getBlogHours(env),
     blogReady: blogConfigured(env),
     requireImage: await requireImage(env),
     autoStory: await autoStoryEnabled(env),
     notifyReady: notifyReady(env),
     draftMode: autoDraftEnabled(env),
     fallbackCount: (await env.DB.prepare("SELECT COUNT(*) c FROM fallback_images").first()).c,
     nextRun: nextCairoRun(new Date(), hours)
    });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/auto/toggle" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);
    const b = await request.json();
    const v = b.enabled === true ? "1" : "0";

    await env.DB.prepare(
     "UPDATE auto_settings SET value=? WHERE key='enabled'"
    ).bind(v).run();

    return json({ ok: true, enabled: v === "1" });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/generate" && request.method === "POST") {
   try {
    if (!env.GEMINI_API_KEY) throw Error("GEMINI_API_KEY غير موجود");

    const b = await request.json();
    const topic = String(b.topic || "").trim().slice(0, 300);
    const category = String(b.category || "محتوى ثقافي").slice(0, 100);
    const length = String(b.length || "400 إلى 600 كلمة");
    const extra = String(b.extra || "").slice(0, 500);

    if (!topic) return json({ ok: false, error: "اكتب موضوع المنشور" }, 400);

    const prompt = `اكتب مقالاً عربياً لصفحة أقوال. الموضوع: ${topic}. التصنيف: ${category}. الطول: ${length}. تعليمات: ${extra || "لا توجد"}. ابدأ بعنوان جذاب ومقدمة مشوقة وسرد مترابط وخاتمة تفاعلية. لا تختلق تواريخ أو اقتباسات أو مصادر. استخدم العربية الفصحى المبسطة وأخرج المقال فقط.`;

    const d = await callGemini(env, {
     systemInstruction: {
      parts: [{ text: "أنت محرر تاريخي وثقافي محترف والدقة أهم من الإثارة." }]
     },
     contents: [{ role: "user", parts: [{ text: prompt }] }],
     generationConfig: {
      temperature: 0.75,
      maxOutputTokens: 2500
     }
    });

    const content = (d.candidates?.[0]?.content?.parts || [])
     .map(x => x.text || "").join("").trim();

    if (!content) throw Error("لم يرجع Gemini نصاً");

    await ensurePostsSchema(env.DB);

    const saved = await env.DB.prepare(
     "INSERT INTO posts (content,post_type,status) VALUES (?,?,'draft')"
    ).bind(content, category).run();

    const id = saved.meta.last_row_id;
    let image = null;
    let imageError = null;

    try {
     image = await findTopicImage(env, topic, { postId: id });
     await saveImageToPost(env, id, image);
    } catch (e) {
     imageError = e.message;
    }

    return json({ ok: true, id, content, image, imageError });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/save-draft" && request.method === "POST") {
   try {
    const b = await request.json();
    const content = String(b.content || "").trim();
    const category = String(b.category || "محتوى");
    const explicit = String(b.topic || "").trim().slice(0, 300);
    const topic = explicit || topicFromContent(content);
    const context = explicit ? "" : content;

    if (!content) return json({ ok: false, error: "المحتوى فارغ" }, 400);

    await ensurePostsSchema(env.DB);

    const x = await env.DB.prepare(
     "INSERT INTO posts (content,post_type,status) VALUES (?,?,'draft')"
    ).bind(content, category).run();

    const id = x.meta.last_row_id;
    let image = null;
    let imageError = null;

    try {
     image = await findTopicImage(env, topic, { postId: id, context });
     await saveImageToPost(env, id, image);
    } catch (e) {
     imageError = e.message;
    }

    return json({ ok: true, id, image, imageError });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/test-image" && request.method === "POST") {
   try {
    const body = await request.json();
    const topic = String(body.topic || "").trim();

    if (!topic) {
     return json({ ok: false, error: "اكتب موضوع البحث" }, 400);
    }

    const image = await findTopicImage(env, topic);

    return json({ ok: true, topic, image });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/drafts" && request.method === "GET") {
   try {
    await ensurePostsSchema(env.DB);

    const x = await env.DB.prepare(
     "SELECT id,content,post_type,created_at,image_url,image_page,image_author,image_license FROM posts WHERE status='draft' ORDER BY id DESC LIMIT 50"
    ).all();

    return json({ ok: true, items: x.results || [] });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/delete-draft" && request.method === "POST") {
   try {
    const id = Number((await request.json()).id);

    if (!Number.isInteger(id) || id < 1) {
     return json({ ok: false, error: "رقم المسودة غير صحيح" }, 400);
    }

    const x = await env.DB.prepare(
     "DELETE FROM posts WHERE id=? AND status='draft'"
    ).bind(id).run();

    if (!x.meta.changes) {
     return json({ ok: false, error: "المسودة غير موجودة" }, 404);
    }

    return json({ ok: true });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/publish-draft" && request.method === "POST") {
   let id = 0;
   let claimed = false;

   try {
    id = Number((await request.json()).id);

    await ensureAutoSchema(env.DB);

    /* حجز المسودة ذرياً لمنع النشر المزدوج */
    const claim = await env.DB.prepare(
     "UPDATE posts SET status='publishing' WHERE id=? AND status='draft'"
    ).bind(id).run();

    if (!claim.meta.changes) {
     return json({ ok: false, error: "المسودة غير موجودة أو سبق نشرها" }, 404);
    }

    claimed = true;

    const p = await env.DB.prepare(
     "SELECT id,content,image_url,image_page,image_author,image_license FROM posts WHERE id=?"
    ).bind(id).first();

    let image = p.image_url
     ? { url: p.image_url, page: p.image_page, author: p.image_author, license: p.image_license }
     : null;

    /* لا بحث جديد إن كانت الصورة محفوظة */
    if (!image) {
     try {
      image = await findTopicImage(env, topicFromContent(p.content), { postId: id, context: p.content });
      await saveImageToPost(env, id, image);
     } catch (e) {
      if (await requireImage(env)) throw e;
     }
    }

    const fb = await publishPost(env, p.content, image);

    await env.DB.prepare(
     "UPDATE posts SET status='published',facebook_post_id=?,published_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(fb, id).run();

    await env.DB.prepare(
     "INSERT INTO publish_logs (post_id,result,message,fb_post_id,image_url) VALUES (?,'success',?,?,?)"
    ).bind(id, fb, fb, image?.url || null).run();

    return json({ ok: true, id: fb });
   } catch (e) {
    if (claimed) {
     await env.DB.prepare(
      "UPDATE posts SET status='draft' WHERE id=? AND status='publishing'"
     ).bind(id).run();

     await env.DB.prepare(
      "INSERT INTO publish_logs (post_id,result,message) VALUES (?,'failed',?)"
     ).bind(id, String(e.message || e).slice(0, 900)).run();
    }

    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/publish" && request.method === "POST") {
   try {
    const b = await request.json();
    const message = String(b.message || "").trim();
    const explicit = String(b.topic || "").trim().slice(0, 300);
    const topic = explicit || topicFromContent(message);
    const context = explicit ? "" : message;

    if (!message) return json({ ok: false, error: "نص المنشور فارغ" }, 400);

    await ensureAutoSchema(env.DB);

    let image = null;
    try {
     image = await findTopicImage(env, topic, { context });
    } catch (e) {
     if (await requireImage(env)) throw e;
    }

    const fb = await publishPost(env, message, image);

    await env.DB.prepare(
     "INSERT INTO posts (content,status,facebook_post_id,published_at,image_url,image_page,image_author,image_license) VALUES (?,'published',?,CURRENT_TIMESTAMP,?,?,?,?)"
    ).bind(
     message, fb,
     image?.url || null, image?.page || null,
     image?.author || null, image?.license || null
    ).run();

    await env.DB.prepare(
     "INSERT INTO publish_logs (result,message,fb_post_id,image_url) VALUES ('success',?,?,?)"
    ).bind(fb, fb, image?.url || null).run();

    return json({ ok: true, id: fb });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/topics" && request.method === "GET") {
   try {
    await ensureAutoSchema(env.DB);

    const items = (await env.DB.prepare(
     "SELECT id,category,topic FROM custom_topics ORDER BY id DESC LIMIT 300"
    ).all()).results || [];

    const s = await env.DB.prepare(
     "SELECT value FROM auto_settings WHERE key='use_builtin'"
    ).first();

    return json({
     ok: true,
     items,
     builtinCount: TOPICS.length,
     useBuiltin: s?.value !== "0"
    });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/topics/add" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);

    const b = await request.json();
    const category = String(b.category || "").trim().slice(0, 60) || "محتوى";
    const list = [...new Set(
     (Array.isArray(b.topics) ? b.topics : [])
      .map(x => String(x || "").trim().slice(0, 200))
      .filter(x => x.length >= 3)
    )].slice(0, 100);

    if (!list.length) {
     return json({ ok: false, error: "اكتب موضوعاً واحداً على الأقل (3 أحرف فأكثر)" }, 400);
    }

    let added = 0;

    for (const topic of list) {
     const r = await env.DB.prepare(
      "INSERT OR IGNORE INTO custom_topics (category,topic) VALUES (?,?)"
     ).bind(category, topic).run();
     added += r.meta.changes || 0;
    }

    return json({ ok: true, added, skipped: list.length - added });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/topics/delete" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);
    const id = Number((await request.json()).id);

    await env.DB.prepare("DELETE FROM custom_topics WHERE id=?").bind(id).run();

    return json({ ok: true });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/settings/builtin-topics" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);
    const v = (await request.json()).enabled === false ? "0" : "1";

    await env.DB.prepare(
     "UPDATE auto_settings SET value=? WHERE key='use_builtin'"
    ).bind(v).run();

    return json({ ok: true, use_builtin: v === "1" });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/notify/test" && request.method === "POST") {
   if (!notifyReady(env)) {
    return json({ ok: false, error: "أضف TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID في Cloudflare أولاً" }, 400);
   }

   /* نستدعي تيليجرام مباشرة لنعرض سبب الرفض الحقيقي */
   try {
    const r = await fetch(
     `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
     {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
       chat_id: env.TELEGRAM_CHAT_ID,
       text: "✅ تنبيه تجريبي من لوحة أقوال: الاتصال يعمل."
      })
     }
    );
    const d = await r.json().catch(() => ({}));

    if (r.ok && d.ok) return json({ ok: true });

    const why = String(d.description || "");
    let hint = "";

    if (/unauthorized|not found/i.test(why) && r.status === 401) hint = "التوكن خاطئ أو ناقص.";
    else if (/chat not found/i.test(why)) hint = "رقم المحادثة خاطئ، أو لم تضغط Start على البوت.";
    else if (/bot can't initiate|forbidden/i.test(why)) hint = "افتح محادثة مع البوت واضغط Start أولاً.";

    return json({
     ok: false,
     error: "تيليجرام: " + (why || ("HTTP " + r.status)) + (hint ? " — " + hint : "")
    }, 502);
   } catch (e) {
    return json({ ok: false, error: "تعذر الوصول إلى تيليجرام: " + e.message }, 502);
   }
  }

  if (url.pathname === "/api/blog/status" && request.method === "GET") {
   const configured = blogConfigured(env);

   if (!configured) {
    return json({ ok: true, configured: false, connected: false });
   }

   try {
    const token = await getGoogleToken(env);
    const blogId = await getBlogId(env);

    const r = await fetch(
     `https://www.googleapis.com/blogger/v3/blogs/${blogId}?fields=name,url`,
     { headers: { Authorization: "Bearer " + token } }
    );
    const d = await r.json();

    if (!r.ok) throw Error(d.error?.message || "تعذر قراءة المدونة");

    return json({ ok: true, configured: true, connected: true, name: d.name, url: d.url });
   } catch (e) {
    return json({ ok: true, configured: true, connected: false, error: e.message });
   }
  }

  if (url.pathname === "/api/blog/generate" && request.method === "POST") {
   try {
    const b = await request.json();
    const topic = String(b.topic || "").trim().slice(0, 300);
    const category = String(b.category || "محتوى");

    if (!topic) return json({ ok: false, error: "اكتب الموضوع أولاً" }, 400);

    let image = null;
    try {
     image = await findTopicImage(env, topic);
    } catch (e) {
     if (await requireImage(env)) throw e;
    }

    const article = await generateArticle(env, topic, category);

    return json({ ok: true, title: article.title, body: article.body, image });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/blog/publish" && request.method === "POST") {
   try {
    const b = await request.json();
    const title = String(b.title || "").trim().slice(0, 150);
    const body = cleanArticleHtml(b.body);
    const category = String(b.category || "محتوى");
    const topic = String(b.topic || "").trim().slice(0, 300) || title;

    if (!title || !body) {
     return json({ ok: false, error: "العنوان ونص المقال مطلوبان" }, 400);
    }

    /* الصورة المقبولة من ويكيميديا فقط */
    let image = null;
    try {
     const iu = new URL(String(b.image?.url || ""));
     if (iu.protocol === "https:" && iu.hostname === "upload.wikimedia.org") {
      image = {
       url: iu.href,
       page: String(b.image.page || ""),
       author: String(b.image.author || "").slice(0, 120),
       license: String(b.image.license || "").slice(0, 60)
      };
     }
    } catch (e) {}

    const blog = await publishBlogPost(env, {
     title,
     html: buildBlogHtml(body, image),
     labels: ["ALL", category]
    });

    let fbId = null;
    let fbError = null;

    if (b.share === true) {
     try {
      await ensureAutoSchema(env.DB);

      const teaser = await generateAutoContent(env, topic, category);
      const content = teaser + "\n\n📖 اقرأ المقال كاملاً: " + blog.url;

      fbId = await publishPost(env, content, image);

      await env.DB.prepare(
       "INSERT INTO posts (content,post_type,status,facebook_post_id,published_at,image_url,image_page,image_author,image_license) VALUES (?,?,'published',?,CURRENT_TIMESTAMP,?,?,?,?)"
      ).bind(
       content, category, fbId,
       image?.url || null, image?.page || null,
       image?.author || null, image?.license || null
      ).run();

      await env.DB.prepare(
       "INSERT INTO publish_logs (result,message,fb_post_id,image_url) VALUES ('success',?,?,?)"
      ).bind(fbId, fbId, image?.url || null).run();
     } catch (e) {
      fbError = e.message;
     }
    }

    return json({ ok: true, blog_url: blog.url, fb_id: fbId, fbError });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/fallback/add" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);

    const b = await request.json();
    const m = String(b.page || "").match(/commons\.wikimedia\.org\/wiki\/(File:[^?#\s]+)/i);

    if (!m) {
     return json({ ok: false, error: "الصق رابط صفحة الملف من ويكيميديا كومنز (يحتوي File:)" }, 400);
    }

    const api = new URL("https://commons.wikimedia.org/w/api.php");
    api.searchParams.set("action", "query");
    api.searchParams.set("titles", decodeURIComponent(m[1]).replace(/_/g, " "));
    api.searchParams.set("prop", "imageinfo");
    api.searchParams.set("iiprop", "url|extmetadata|size|mime");
    api.searchParams.set("iiurlwidth", "1280");
    api.searchParams.set("format", "json");

    const r = await fetch(api, { headers: { "User-Agent": WIKI_UA } });
    const i = Object.values((await r.json()).query?.pages || {})[0]?.imageinfo?.[0];

    if (!i) return json({ ok: false, error: "لم أجد هذا الملف" }, 404);

    if (!["image/jpeg", "image/png"].includes(i.mime)) {
     return json({ ok: false, error: "الصيغة غير مدعومة (المطلوب JPEG أو PNG)" }, 400);
    }

    const license = cleanHtml(i.extmetadata?.LicenseShortName?.value);

    if (!licenseOk(license)) {
     return json({ ok: false, error: "الترخيص غير مناسب: " + (license || "غير معروف") }, 400);
    }

    const imgUrl = i.thumburl || i.url;

    const exists = await env.DB.prepare(
     "SELECT id FROM fallback_images WHERE url=?"
    ).bind(imgUrl).first();

    if (!exists) {
     await env.DB.prepare(
      "INSERT INTO fallback_images (url,author,license,page_url) VALUES (?,?,?,?)"
     ).bind(
      imgUrl,
      cleanHtml(i.extmetadata?.Artist?.value).slice(0, 120),
      license,
      i.descriptionurl
     ).run();
    }

    const count = (await env.DB.prepare("SELECT COUNT(*) c FROM fallback_images").first()).c;

    return json({ ok: true, count, license, title: m[1].replace(/_/g, " ") });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/image-proxy" && request.method === "GET") {
   try {
    const u = new URL(url.searchParams.get("url") || "");

    if (u.protocol !== "https:" || u.hostname !== "upload.wikimedia.org") {
     return json({ ok: false, error: "مصدر الصورة غير مسموح" }, 400);
    }

    let r;

    try {
     r = await fetchWikiImage(u.href);
    } catch (e) {
     return json({ ok: false, error: e.message }, 502);
    }

    return new Response(r.body, {
     headers: { "Content-Type": r.headers.get("Content-Type") || "image/jpeg" }
    });
   } catch (e) {
    return json({ ok: false, error: "رابط غير صالح" }, 400);
   }
  }

  if (url.pathname === "/api/story/publish" && request.method === "POST") {
   try {
    const bytes = await request.arrayBuffer();

    if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) {
     return json({ ok: false, error: "حجم الصورة غير صالح" }, 400);
    }

    const id = await publishStoryBlob(
     env, new Blob([bytes], { type: "image/jpeg" })
    );

    await ensurePublishLogsSchema(env.DB);
    await env.DB.prepare(
     "INSERT INTO publish_logs (result,message,fb_post_id) VALUES ('story',?,?)"
    ).bind(id, id).run();

    return json({ ok: true, id });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/reel/publish" && request.method === "POST") {
   try {
    const declared = Number(request.headers.get("content-length") || 0);

    if (declared > MAX_REEL_BYTES) {
     return json({ ok: false, error: "حجم الفيديو أكبر من 60 ميغابايت" }, 413);
    }

    const bytes = await request.arrayBuffer();

    if (!bytes.byteLength || bytes.byteLength > MAX_REEL_BYTES) {
     return json({ ok: false, error: "حجم الفيديو غير صالح" }, 400);
    }

    let description = "";
    try {
     description = decodeURIComponent(request.headers.get("x-description") || "");
    } catch (e) {}

    const videoId = await publishReel(env, bytes, description.slice(0, 800));

    await ensurePublishLogsSchema(env.DB);
    await env.DB.prepare(
     "INSERT INTO publish_logs (result,message,fb_post_id) VALUES ('reel',?,?)"
    ).bind(videoId, videoId).run();

    return json({ ok: true, video_id: videoId });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/reel/status" && request.method === "GET") {
   try {
    const id = (url.searchParams.get("id") || "").replace(/\D/g, "");

    if (!id) return json({ ok: false, error: "رقم الفيديو مطلوب" }, 400);

    const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${id}`);
    u.searchParams.set("fields", "status");
    u.searchParams.set("access_token", env.PAGE_ACCESS_TOKEN);

    const r = await fetch(u);
    const d = await r.json();

    if (!r.ok) {
     return json({ ok: false, error: d.error?.message || "تعذر فحص الحالة" }, 400);
    }

    return json({ ok: true, status: d.status || null });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/settings/auto-story" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);
    const v = (await request.json()).enabled === true ? "1" : "0";

    await env.DB.prepare(
     "UPDATE auto_settings SET value=? WHERE key='auto_story'"
    ).bind(v).run();

    return json({ ok: true, auto_story: v === "1" });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/auto/hours" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);

    const b = await request.json();
    const list = [...new Set(
     (Array.isArray(b.hours) ? b.hours : []).map(Number)
      .filter(n => Number.isInteger(n) && n >= 0 && n <= 23)
    )].sort((a, c) => a - c);

    if (!list.length) {
     return json({ ok: false, error: "اختر ساعة واحدة على الأقل" }, 400);
    }

    await env.DB.prepare(
     "UPDATE auto_settings SET value=? WHERE key='hours'"
    ).bind(list.join(",")).run();

    /* ساعات المقالات يجب أن تكون ضمن ساعات النشر */
    const blogList = [...new Set(
     (Array.isArray(b.blogHours) ? b.blogHours : []).map(Number)
      .filter(n => list.includes(n))
    )].sort((a, c) => a - c);

    await env.DB.prepare(
     "UPDATE auto_settings SET value=? WHERE key='blog_hours'"
    ).bind(blogList.join(",")).run();

    return json({
     ok: true,
     hours: list,
     blogHours: blogList,
     nextRun: nextCairoRun(new Date(), list)
    });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  const preview = url.pathname.match(/^\/api\/posts\/(\d+)\/image-preview$/);

  if (preview && request.method === "GET") {
   try {
    await ensurePostsSchema(env.DB);

    const p = await env.DB.prepare(
     "SELECT id,image_url,image_page,image_author,image_license FROM posts WHERE id=?"
    ).bind(Number(preview[1])).first();

    if (!p) return json({ ok: false, error: "المنشور غير موجود" }, 404);

    return json({
     ok: true,
     image: p.image_url
      ? { url: p.image_url, page: p.image_page, author: p.image_author, license: p.image_license }
      : null
    });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/regenerate-image" && request.method === "POST") {
   try {
    const b = await request.json();
    const id = Number(b.id);

    await ensurePostsSchema(env.DB);

    const p = await env.DB.prepare(
     "SELECT id,content,status,image_url FROM posts WHERE id=?"
    ).bind(id).first();

    if (!p || p.status !== "draft") {
     return json({ ok: false, error: "المسودة غير موجودة أو سبق نشرها" }, 404);
    }

    const explicit = String(b.topic || "").trim().slice(0, 300);
    const topic = explicit || topicFromContent(p.content);

    let image;

    try {
     image = await findTopicImage(env, topic, {
      postId: id,
      context: explicit ? "" : p.content,
      skip: p.image_url ? [p.image_url] : []
     });
    } catch (e) {
     return json({ ok: false, error: "لا توجد صورة بديلة أخرى لهذا الموضوع" }, 404);
    }

    await saveImageToPost(env, id, image);

    return json({ ok: true, image });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  if (url.pathname === "/api/settings/require-image" && request.method === "POST") {
   try {
    await ensureAutoSchema(env.DB);
    const v = (await request.json()).enabled === false ? "0" : "1";

    await env.DB.prepare(
     "UPDATE auto_settings SET value=? WHERE key='require_image'"
    ).bind(v).run();

    return json({ ok: true, require_image: v === "1" });
   } catch (e) {
    return json({ ok: false, error: e.message }, 500);
   }
  }

  return new Response("Not Found", { status: 404 });
 }
