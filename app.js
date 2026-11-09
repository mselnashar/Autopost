"use strict";

(() => {
  const $ = id => document.getElementById(id);

  function showStatus(id, message, type = "") {
    const el = $(id);
    if (!el) return;
    el.textContent = message;
    el.className = "status " + type;
  }

  async function api(path, method = "GET", body = null) {
    const key = $("admin")?.value.trim();
    if (!key) throw new Error("أدخل مفتاح الإدارة");

    const response = await fetch(path, {
      method,
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "حدث خطأ في الاتصال");
    }

    return data;
  }

  function preview() {
    const message = $("message");
    if (!message) return;

    const value = message.value;
    if ($("preview")) {
      $("preview").textContent = value || "ستظهر المعاينة هنا.";
    }

    const count = value.trim()
      ? value.trim().split(/\s+/).length
      : 0;

    if ($("wordCount")) {
      $("wordCount").textContent = count + " كلمة";
    }
  }

  async function checkConnection() {
    showStatus("connection", "جاري فحص الاتصال...");

    try {
      const data = await api("/api/status");
      showStatus(
        "connection",
        "متصل بصفحة " + data.page,
        "ok"
      );
      await stats();
    } catch (error) {
      showStatus("connection", error.message, "err");
    }
  }

  async function stats() {
    try {
      const data = await api("/api/stats");

      $("total").textContent = data.total ?? 0;
      $("draftCount").textContent = data.drafts ?? 0;
      $("publishedCount").textContent = data.published ?? 0;
    } catch (error) {
      console.error("Stats:", error);
    }
  }

  async function refreshAll() {
    await checkConnection();
    await stats();
    await loadDrafts();
    await loadAuto();
  }

  async function generate() {
    const topic = $("topic").value.trim();

    if (!topic) {
      showStatus("aiStatus", "اكتب الموضوع أولاً", "err");
      return;
    }

    const button = $("generateBtn");
    button.disabled = true;

    showStatus("aiStatus", "جاري إنشاء المحتوى...");

    try {
      const data = await api("/api/generate", "POST", {
        topic,
        category: $("category").value,
        length: $("length").value,
        extra: $("extra").value
      });

      $("message").value = data.content;
      preview();

      showStatus(
        "aiStatus",
        "تم إنشاء المسودة رقم " + data.id +
          (data.imageError
            ? " — بدون صورة: " + data.imageError
            : " — مع صورة"),
        data.imageError ? "err" : "ok"
      );

      await loadDrafts();
      await stats();

    } catch (error) {
      showStatus("aiStatus", error.message, "err");
    } finally {
      button.disabled = false;
    }
  }

  async function saveDraft() {
    const content = $("message").value.trim();

    if (!content) {
      showStatus("aiStatus", "المحتوى فارغ", "err");
      return;
    }

    try {
      const data = await api("/api/save-draft", "POST", {
        content,
        category: $("category").value,
        topic: $("topic").value.trim()
      });

      showStatus(
        "aiStatus",
        "تم حفظ المسودة رقم " + data.id +
          (data.imageError ? " — بدون صورة: " + data.imageError : ""),
        data.imageError ? "err" : "ok"
      );

      await loadDrafts();
      await stats();

    } catch (error) {
      showStatus("aiStatus", error.message, "err");
    }
  }

  async function loadDrafts() {
    const box = $("drafts");
    box.textContent = "جاري تحميل المسودات...";

    try {
      const data = await api("/api/drafts");
      box.replaceChildren();

      if (!data.items?.length) {
        box.textContent = "لا توجد مسودات";
        return;
      }

      data.items.forEach(post => {
        const card = document.createElement("div");
        card.className = "post";

        const title = document.createElement("b");
        title.textContent = "مسودة #" + post.id;

        const thumb = document.createElement(post.image_url ? "img" : "div");

        if (post.image_url) {
          thumb.src = post.image_url;
          thumb.alt = "";
          thumb.loading = "lazy";
          thumb.style.cssText =
            "width:100%;max-height:200px;object-fit:cover;border-radius:10px;margin:8px 0";
        } else {
          thumb.className = "muted";
          thumb.textContent = "⚠️ لا توجد صورة لهذه المسودة";
        }

        const content = document.createElement("p");
        content.textContent = post.content;

        const actions = document.createElement("div");
        actions.className = "actions";

        const edit = makeButton("تعديل", "secondary", () => {
          $("message").value = post.content;
          preview();
          $("message").scrollIntoView({ behavior: "smooth" });
        });

        const regen = makeButton("تغيير الصورة", "secondary", () => {
          regenerateImage(post.id);
        });

        const publish = makeButton("نشر", "primary", () => {
          publishDraft(post.id);
        });

        const remove = makeButton("حذف", "danger", () => {
          deleteDraft(post.id);
        });

        actions.append(edit, regen, publish, remove);
        card.append(title, thumb, content, actions);
        box.append(card);
      });

    } catch (error) {
      box.textContent = error.message;
    }
  }

  function makeButton(label, style, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = style;
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }

  async function regenerateImage(id) {
    try {
      await api("/api/regenerate-image", "POST", { id });
      await loadDrafts();
    } catch (error) {
      alert(error.message);
    }
  }

  async function deleteDraft(id) {
    if (!confirm("هل تريد حذف هذه المسودة؟")) return;

    try {
      await api("/api/delete-draft", "POST", { id });
      await loadDrafts();
      await stats();
    } catch (error) {
      alert(error.message);
    }
  }

  async function publishDraft(id) {
    if (!confirm("هل تريد نشر هذه المسودة على Facebook؟")) return;

    try {
      const data = await api("/api/publish-draft", "POST", { id });
      alert("تم النشر بنجاح: " + data.id);

      await loadDrafts();
      await stats();

    } catch (error) {
      alert(error.message);
    }
  }

  async function publishText() {
    const message = $("message").value.trim();

    if (!message) {
      showStatus("publishStatus", "اكتب المنشور أولاً", "err");
      return;
    }

    if (!confirm("تأكيد النشر على صفحة Facebook؟")) return;

    showStatus("publishStatus", "جاري النشر...");

    try {
      const data = await api("/api/publish", "POST", {
        message,
        topic: $("topic").value.trim()
      });

      showStatus(
        "publishStatus",
        "تم النشر بنجاح: " + data.id,
        "ok"
      );

      await stats();

    } catch (error) {
      showStatus("publishStatus", error.message, "err");
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText($("message").value);
      alert("تم نسخ النص");
    } catch (error) {
      $("message").select();
      alert("حدد النص وانسخه يدوياً");
    }
  }

  function clearEditor() {
    if (!confirm("هل تريد مسح النص؟")) return;

    $("message").value = "";
    preview();
  }

  async function loadAuto() {
    try {
      const data = await api("/api/auto/status");

      showStatus(
        "autoStatus",
        data.enabled
          ? "النشر التلقائي مفعّل"
          : "النشر التلقائي متوقف",
        data.enabled ? "ok" : ""
      );

      $("autoToggle").textContent = data.enabled
        ? "إيقاف النشر التلقائي"
        : "تفعيل النشر التلقائي";

      $("nextRun").textContent =
        "موعد النشر القادم: " + data.nextRun;

      const box = $("autoLogs");
      box.replaceChildren();

      if (!data.logs?.length) {
        box.textContent = "لا توجد محاولات بعد";
        return;
      }

      data.logs.forEach(log => {
        const row = document.createElement("div");
        row.className = "post";

        row.textContent =
          (log.status === "success" ? "نجاح" :
           log.status === "failed" ? "فشل" : "قيد التنفيذ")
          + " | " + (log.topic || "")
          + "\n" + (log.created_at || "")
          + " — " + (log.message || "");

        box.append(row);
      });

    } catch (error) {
      showStatus("autoStatus", error.message, "err");
    }
  }

  async function toggleAuto() {
    const enabled = $("autoToggle").textContent.includes("إيقاف");

    if (!confirm(
      enabled
        ? "هل تريد إيقاف النشر التلقائي؟"
        : "هل تريد تفعيل النشر التلقائي والنشر دون موافقة؟"
    )) return;

    try {
      await api("/api/auto/toggle", "POST", {
        enabled: !enabled
      });

      await loadAuto();

    } catch (error) {
      showStatus("autoStatus", error.message, "err");
    }
  }

  // إتاحة الدوال لأزرار الصفحة الحالية
  window.checkConnection = checkConnection;
  window.refreshAll = refreshAll;
  window.generate = generate;
  window.saveDraft = saveDraft;
  window.loadDrafts = loadDrafts;
  window.deleteDraft = deleteDraft;
  window.publishDraft = publishDraft;
  window.publishText = publishText;
  window.copyText = copyText;
  window.clearEditor = clearEditor;
  window.loadAuto = loadAuto;
  window.toggleAuto = toggleAuto;
  window.regenerateImage = regenerateImage;

  // تشغيل المعاينة عند الكتابة
  document.addEventListener("DOMContentLoaded", () => {
    const message = $("message");

    if (message) {
      message.addEventListener("input", preview);
      preview();
    }
  });

})();
/* أقوال Reels Studio — استوديو إنشاء الريلز */
(() => {
"use strict";

if (document.getElementById("aqwalReelsStudio")) return;

const main = document.querySelector("main");
if (!main) return;

const section = document.createElement("section");
section.id = "aqwalReelsStudio";
section.className = "card";

section.innerHTML = `
<div class="head">
<h2>استوديو الريلز المجاني</h2>
<span class="tag">تجريبي</span>
</div>

<p class="muted">اكتب كل مشهد في سطر مستقل، وسيحوّلها الاستوديو إلى فيديو رأسي متحرك.</p>

<label>عنوان الريل</label>
<input id="reelTitle" maxlength="90" placeholder="مثلاً: معلومة تاريخية ستفاجئك">

<label>نص المشاهد — كل مشهد في سطر</label>
<textarea id="reelScenes" style="min-height:150px"
placeholder="هل تعلم أن...؟
المشهد الثاني...
المشهد الثالث...
معلومة تستحق المشاركة!"></textarea>

<div class="grid">
<div>
<label>مدة الفيديو</label>
<select id="reelDuration">
<option value="30">30 ثانية</option>
<option value="40" selected>40 ثانية</option>
<option value="45">45 ثانية</option>
</select>
</div>

<div>
<label>نمط العرض</label>
<select id="reelStyle">
<option value="purple">أقوال — بنفسجي</option>
<option value="dark">داكن</option>
<option value="light">فاتح</option>
</select>
</div>
</div>

<div class="actions">
<button class="primary" id="reelPreviewBtn">معاينة الريل</button>
<button class="secondary" id="reelExportBtn" disabled>تصدير الفيديو WebM</button>
</div>

<div id="reelMessage" class="status">
أدخل عنواناً ومشاهد ثم اضغط معاينة.
</div>

<div style="max-width:270px;margin:12px auto;background:#171321;border-radius:16px;padding:7px">
<canvas id="reelCanvas" width="540" height="960"
style="display:block;width:100%;height:auto;border-radius:11px;background:#302052">
</canvas>
</div>

<p class="muted">
فيديو رأسي 9:16. الإصدار الأول بلا صور خارجية أو تعليق صوتي.
يعتمد التصدير على دعم المتصفح لصيغة WebM.
</p>
`;

const footer = main.querySelector(".footer");
main.insertBefore(section, footer || null);

const $ = id => document.getElementById(id);
const canvas = $("reelCanvas");
const ctx = canvas.getContext("2d");

let scenes = [];
let title = "";
let duration = 40;
let raf = 0;
let startedAt = 0;
let previewing = false;

function wrap(text, width, font) {
    ctx.font = font;
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";

    for (const word of words) {
        const test = line ? line + " " + word : word;

        if (ctx.measureText(test).width > width && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    }

    if (line) lines.push(line);
    return lines;
}

function draw(sec) {
    const palettes = {
        purple: ["#211438", "#6845a3", "#c6a7f4"],
        dark: ["#10131f", "#28334e", "#8fb8ff"],
        light: ["#f6f0ff", "#d9c8f4", "#6845a3"]
    };

    const [c1, c2, accent] = palettes[$("reelStyle").value];

    const g = ctx.createLinearGradient(0, 0, 540, 960);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 540, 960);

    ctx.globalAlpha = .13;
    ctx.fillStyle = accent;

    ctx.beginPath();
    ctx.arc(80 + Math.sin(sec) * 18, 170, 120, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(480, 760, 180, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    ctx.direction = "rtl";
    ctx.fillStyle = accent;
    ctx.font = "bold 28px Arial";
    ctx.fillText("أقــــوال", 270, 105);

    const fg = $("reelStyle").value === "light"
        ? "#29213a"
        : "#ffffff";

    ctx.fillStyle = fg;

    let y = 220;

    wrap(
        title || "معلومة تستحق المعرفة",
        430,
        "bold 38px Arial"
    ).slice(0, 3).forEach(line => {
        ctx.font = "bold 38px Arial";
        ctx.fillText(line, 270, y);
        y += 54;
    });

    const idx = Math.min(
        scenes.length - 1,
        Math.floor(sec / (duration / Math.max(1, scenes.length)))
    );

    const lines = wrap(
        scenes[idx] || "اكتب مشاهد الريل",
        430,
        "bold 39px Arial"
    );

    const lineHeight = 62;
    const startY = 500 - (lines.length - 1) * lineHeight / 2;

    ctx.fillStyle = fg;
    ctx.font = "bold 39px Arial";

    lines.slice(0, 6).forEach((line, i) => {
        ctx.fillText(line, 270, startY + i * lineHeight);
    });

    ctx.fillStyle = accent;
    ctx.fillRect(55, 835, 430, 5);

    ctx.fillRect(
        55,
        835,
        430 * Math.max(0, Math.min(1, sec / duration)),
        5
    );

    ctx.fillStyle = fg;
    ctx.font = "24px Arial";
    ctx.fillText("تابعنا للمزيد من المعلومات", 270, 890);
}

function msg(text, error = false) {
    $("reelMessage").textContent = text;
    $("reelMessage").className = "status" + (error ? " err" : " ok");
}

function stop() {
    previewing = false;
    cancelAnimationFrame(raf);
}

function animate() {
    if (!previewing) return;

    const s = (performance.now() - startedAt) / 1000;

    if (s >= duration) {
        stop();
        draw(duration);
        msg("انتهت المعاينة. يمكنك تصدير الفيديو.");
        return;
    }

    draw(s);
    raf = requestAnimationFrame(animate);
}

$("reelPreviewBtn").onclick = () => {
    title = $("reelTitle").value.trim();

    scenes = $("reelScenes").value
        .split(/\n+/)
        .map(x => x.trim())
        .filter(Boolean);

    duration = +$("reelDuration").value;

    if (!title || scenes.length < 2) {
        msg("أدخل عنواناً ومشهدين على الأقل، كل مشهد في سطر.", true);
        return;
    }

    stop();

    $("reelExportBtn").disabled = false;

    startedAt = performance.now();
    previewing = true;

    msg("تعمل المعاينة الآن...");
    animate();
};

$("reelStyle").onchange = () => draw(0);

$("reelExportBtn").onclick = () => {

    if (!scenes.length) {
        msg("أنشئ المعاينة أولاً.", true);
        return;
    }

    if (!canvas.captureStream || !window.MediaRecorder) {
        msg("المتصفح لا يدعم تصدير الفيديو. جرّب Chrome المحدث.", true);
        return;
    }

    const btn = $("reelExportBtn");
    btn.disabled = true;

    stop();

    const stream = canvas.captureStream(30);

    const mime = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm"
    ].find(x => MediaRecorder.isTypeSupported(x));

    if (!mime) {
        stream.getTracks().forEach(t => t.stop());
        btn.disabled = false;
        msg("ترميز WebM غير مدعوم.", true);
        return;
    }

    const chunks = [];

    try {
        const rec = new MediaRecorder(stream, {
            mimeType: mime
        });

        rec.ondataavailable = e => {
            if (e.data.size) chunks.push(e.data);
        };

        rec.onerror = () => {
            stream.getTracks().forEach(t => t.stop());
            btn.disabled = false;
            msg("حدث خطأ أثناء التسجيل.", true);
        };

        rec.onstop = () => {
            stream.getTracks().forEach(t => t.stop());

            const blob = new Blob(chunks, { type: mime });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);

            link.href = url;
            link.download = "aqwal-reel.webm";

            document.body.appendChild(link);
            link.click();
            link.remove();

            setTimeout(() => URL.revokeObjectURL(url), 30000);

            btn.disabled = false;
            msg("تم تجهيز الفيديو. ابحث عنه في مجلد التنزيلات.");
        };

        rec.start();

        const start = performance.now();

        function render() {
            const s = (performance.now() - start) / 1000;

            draw(Math.min(s, duration));

            if (s < duration && rec.state === "recording") {
                requestAnimationFrame(render);
            } else if (rec.state === "recording") {
                rec.stop();
            }
        }

        render();

        msg("جاري تسجيل الفيديو. اترك الصفحة مفتوحة حتى يكتمل التصدير.");

    } catch (e) {
        stream.getTracks().forEach(t => t.stop());
        btn.disabled = false;
        msg("تعذر التصدير: " + e.message, true);
    }
};

draw(0);

})();
/* اختبار الصور دون نشر */
(() => {
  const main = document.querySelector("main");
  if (!main || document.getElementById("imageTestBox")) return;

  const box = document.createElement("section");
  box.id = "imageTestBox";
  box.className = "card";

  box.innerHTML = `
    <h2>اختبار الصور التلقائية</h2>
    <label>موضوع البحث</label>
    <input id="imageTestTopic" value="ابن الهيثم وأثره في المنهج العلمي">
    <button class="primary" id="imageTestButton" style="margin-top:12px">
      ابحث عن صورة
    </button>
    <div id="imageTestResult" class="status">لم يبدأ البحث بعد.</div>
    <img id="imageTestPreview" style="display:none;width:100%;border-radius:12px;margin-top:12px">
  `;

  const footer = main.querySelector(".footer");
  main.insertBefore(box, footer || null);

  document.getElementById("imageTestButton").onclick = async () => {
    const topic = document.getElementById("imageTestTopic").value.trim();
    const result = document.getElementById("imageTestResult");
    const preview = document.getElementById("imageTestPreview");

    if (!topic) {
      result.textContent = "اكتب موضوع البحث";
      return;
    }

    result.textContent = "جاري البحث عن صورة...";
    preview.style.display = "none";

    try {
      const response = await fetch("/api/test-image", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + document.getElementById("admin").value.trim(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ topic })
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "فشل البحث");
      }

      preview.src = data.image.url;
      preview.style.display = "block";

      result.textContent =
        "تم العثور على صورة" +
        (data.image.fallback ? " (صورة احتياطية)" : "") + "\n" +
        "المصدر: " + data.image.page + "\n" +
        "صاحب الصورة: " + (data.image.author || "غير محدد") + "\n" +
        "الترخيص: " + (data.image.license || "غير محدد");

    } catch (error) {
      result.textContent = "خطأ: " + error.message;
    }
  };
})();
