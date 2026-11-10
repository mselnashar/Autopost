"use strict";

(() => {
  const $ = id => document.getElementById(id);
  let hours = [];

  /* ---------- أدوات عامة ---------- */

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

  function makeButton(label, style, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = style;
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }

  function showTab(name) {
    document.querySelectorAll(".tab").forEach(t => {
      t.classList.toggle("active", t.id === "tab-" + name);
    });
    document.querySelectorAll(".tabs button").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    window.scrollTo({ top: 0 });
  }

  function hourLabel(h) {
    if (h === 0) return "12 ص";
    if (h < 12) return h + " ص";
    if (h === 12) return "12 م";
    return (h - 12) + " م";
  }

  /* ---------- الاتصال والإحصائيات ---------- */

  async function checkConnection() {
    const badge = $("connection");

    try {
      const data = await api("/api/status");
      badge.textContent = "متصل: " + data.page;
      return true;
    } catch (error) {
      badge.textContent = "غير متصل";
      showStatus("autoStatus", error.message, "err");
      return false;
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
    if (!(await checkConnection())) return;

    await Promise.all([stats(), loadDrafts(), loadAuto()]);
  }

  /* ---------- إنشاء المحتوى ---------- */

  function preview() {
    const message = $("message");
    if (!message || !$("wordCount")) return;

    const value = message.value.trim();
    const count = value ? value.split(/\s+/).length : 0;

    $("wordCount").textContent = count + " كلمة";
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

      await Promise.all([loadDrafts(), stats()]);

    } catch (error) {
      showStatus("aiStatus", error.message, "err");
    } finally {
      button.disabled = false;
    }
  }

  async function saveDraft() {
    const content = $("message").value.trim();

    if (!content) {
      showStatus("publishStatus", "المحتوى فارغ", "err");
      return;
    }

    showStatus("publishStatus", "جاري الحفظ والبحث عن صورة...");

    try {
      const data = await api("/api/save-draft", "POST", {
        content,
        category: $("category").value,
        topic: $("topic").value.trim()
      });

      showStatus(
        "publishStatus",
        "تم حفظ المسودة رقم " + data.id +
          (data.imageError ? " — بدون صورة: " + data.imageError : ""),
        data.imageError ? "err" : "ok"
      );

      await Promise.all([loadDrafts(), stats()]);

    } catch (error) {
      showStatus("publishStatus", error.message, "err");
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

      showStatus("publishStatus", "تم النشر بنجاح: " + data.id, "ok");
      await stats();

    } catch (error) {
      showStatus("publishStatus", error.message, "err");
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText($("message").value);
      showStatus("publishStatus", "تم نسخ النص", "ok");
    } catch (error) {
      $("message").select();
      showStatus("publishStatus", "حدد النص وانسخه يدوياً", "err");
    }
  }

  function clearEditor() {
    if (!confirm("هل تريد مسح النص؟")) return;

    $("message").value = "";
    preview();
  }

  /* ---------- المسودات ---------- */

  async function loadDrafts() {
    const box = $("drafts");
    box.textContent = "جاري التحميل...";

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
        } else {
          thumb.className = "muted";
          thumb.textContent = "⚠️ لا توجد صورة لهذه المسودة";
        }

        const content = document.createElement("p");
        content.textContent = post.content;

        const actions = document.createElement("div");
        actions.className = "row";

        actions.append(
          makeButton("نشر", "primary", () => publishDraft(post.id)),
          makeButton("تعديل", "secondary", () => {
            $("message").value = post.content;
            preview();
            showTab("create");
          }),
          makeButton("تغيير الصورة", "secondary", () => regenerateImage(post.id)),
          makeButton("حذف", "danger", () => deleteDraft(post.id))
        );

        card.append(title, thumb, content, actions);
        box.append(card);
      });

    } catch (error) {
      box.textContent = error.message;
    }
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
      await Promise.all([loadDrafts(), stats()]);
    } catch (error) {
      alert(error.message);
    }
  }

  async function publishDraft(id) {
    if (!confirm("هل تريد نشر هذه المسودة على Facebook؟")) return;

    try {
      const data = await api("/api/publish-draft", "POST", { id });
      alert("تم النشر بنجاح: " + data.id);
      await Promise.all([loadDrafts(), stats()]);
    } catch (error) {
      alert(error.message);
    }
  }

  /* ---------- النشر التلقائي والمواعيد ---------- */

  function renderHours() {
    const grid = $("hoursGrid");
    if (!grid) return;
    grid.replaceChildren();

    for (let h = 0; h < 24; h++) {
      const b = makeButton(hourLabel(h), hours.includes(h) ? "on" : "", () => {
        hours = hours.includes(h)
          ? hours.filter(x => x !== h)
          : [...hours, h].sort((a, c) => a - c);
        renderHours();
      });
      grid.append(b);
    }

    $("hoursSummary").textContent = hours.length
      ? "عدد المنشورات يومياً: " + hours.length
      : "لم تختر أي ساعة";
  }

  function setPreset(list) {
    hours = [...list];
    renderHours();
  }

  async function saveHours() {
    try {
      const data = await api("/api/auto/hours", "POST", { hours });
      hours = data.hours;
      renderHours();
      showStatus("hoursStatus", "تم حفظ المواعيد", "ok");
      await loadAuto();
    } catch (error) {
      showStatus("hoursStatus", error.message, "err");
    }
  }

  async function loadAuto() {
    try {
      const data = await api("/api/auto/status");

      showStatus(
        "autoStatus",
        data.enabled ? "النشر التلقائي مفعّل" : "النشر التلقائي متوقف",
        data.enabled ? "ok" : ""
      );

      $("autoToggle").textContent = data.enabled
        ? "إيقاف النشر التلقائي"
        : "تفعيل النشر التلقائي";

      $("nextRun").textContent = data.nextRun
        ? "الموعد القادم: " + new Date(data.nextRun).toLocaleString("ar-EG", {
            timeZone: "Africa/Cairo",
            weekday: "long",
            hour: "numeric",
            minute: "2-digit"
          })
        : "لا توجد مواعيد محددة";

      hours = data.hours || [];
      renderHours();

      $("requireImage").checked = data.requireImage !== false;
      $("autoStory").checked = data.autoStory === true;

      const box = $("autoLogs");
      box.replaceChildren();

      if (!data.logs?.length) {
        box.textContent = "لا توجد محاولات بعد";
        return;
      }

      data.logs.forEach(log => {
        const row = document.createElement("div");
        row.className = "log";
        row.textContent =
          (log.status === "success" ? "✅ نجاح" :
           log.status === "failed" ? "❌ فشل" : "⏳ قيد التنفيذ")
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
      await api("/api/auto/toggle", "POST", { enabled: !enabled });
      await loadAuto();
    } catch (error) {
      showStatus("autoStatus", error.message, "err");
    }
  }

  /* ---------- إعدادات الصور ---------- */

  async function saveRequireImage() {
    try {
      await api("/api/settings/require-image", "POST", {
        enabled: $("requireImage").checked
      });
    } catch (error) {
      alert(error.message);
      $("requireImage").checked = !$("requireImage").checked;
    }
  }

  async function testImage() {
    const topic = $("imageTestTopic").value.trim();
    const img = $("imageTestPreview");

    if (!topic) {
      showStatus("imageTestResult", "اكتب موضوع البحث", "err");
      return;
    }

    showStatus("imageTestResult", "جاري البحث عن صورة...");
    img.style.display = "none";

    try {
      const data = await api("/api/test-image", "POST", { topic });

      img.src = data.image.url;
      img.style.display = "block";

      showStatus(
        "imageTestResult",
        "تم العثور على صورة" + (data.image.fallback ? " (احتياطية)" : "") +
          "\nالمصدر: " + data.image.page +
          "\nصاحب الصورة: " + (data.image.author || "غير محدد") +
          "\nالترخيص: " + (data.image.license || "غير محدد"),
        "ok"
      );
    } catch (error) {
      showStatus("imageTestResult", "خطأ: " + error.message, "err");
    }
  }

  /* ---------- القصص ---------- */

  let storyImg = null;
  let storyMeta = null;

  function wrapLines(ctx, text, width) {
    const lines = [];
    let line = "";

    for (const word of text.split(/\s+/)) {
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

  function storyDraw() {
    const canvas = $("storyCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#302052";
    ctx.fillRect(0, 0, 1080, 1920);

    if (!storyImg) return;

    const scale = Math.max(1080 / storyImg.width, 1920 / storyImg.height);
    const w = storyImg.width * scale;
    const h = storyImg.height * scale;
    ctx.drawImage(storyImg, (1080 - w) / 2, (1920 - h) / 2, w, h);

    const g = ctx.createLinearGradient(0, 1100, 0, 1920);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,.8)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 1100, 1080, 820);

    ctx.direction = "rtl";
    ctx.textAlign = "center";

    const title = $("storyUseText").checked ? $("storyTitle").value.trim() : "";

    if (title) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 70px Tahoma, Arial";
      wrapLines(ctx, title, 900).slice(0, 4).forEach((line, i) => {
        ctx.fillText(line, 540, 1450 + i * 92);
      });
    }

    /* سطر المصدر على الصورة نفسها (القصص بلا نص مرافق) */
    if (storyMeta) {
      const credit = "📷 " + (storyMeta.author || "").slice(0, 50) +
        " — " + (storyMeta.license || "") + " — Wikimedia Commons";
      ctx.fillStyle = "rgba(255,255,255,.88)";
      ctx.font = "30px Tahoma, Arial";
      ctx.fillText(credit, 540, 1870);
    }
  }

  async function storyFindImage() {
    const topic = $("storyTopic").value.trim();

    if (!topic) {
      showStatus("storyStatus", "اكتب الموضوع أولاً", "err");
      return;
    }

    $("storyPublishBtn").disabled = true;
    showStatus("storyStatus", "جاري البحث عن صورة...");

    try {
      const data = await api("/api/test-image", "POST", { topic });
      storyMeta = data.image;

      const r = await fetch(
        "/api/image-proxy?url=" + encodeURIComponent(data.image.url),
        { headers: { Authorization: "Bearer " + $("admin").value.trim() } }
      );

      if (!r.ok) throw new Error("تعذر تحميل الصورة");

      storyImg = await createImageBitmap(await r.blob());

      if (!$("storyTitle").value) $("storyTitle").value = topic;

      storyDraw();
      $("storyPublishBtn").disabled = false;
      showStatus("storyStatus", "الصورة جاهزة للنشر", "ok");

    } catch (error) {
      showStatus("storyStatus", error.message, "err");
    }
  }

  async function storyPublish() {
    if (!storyImg) return;
    if (!confirm("نشر هذه القصة على صفحة Facebook؟")) return;

    const button = $("storyPublishBtn");
    button.disabled = true;
    showStatus("storyStatus", "جاري نشر القصة...");

    try {
      const blob = await new Promise((resolve, reject) => {
        $("storyCanvas").toBlob(
          b => (b ? resolve(b) : reject(new Error("تعذر تجهيز الصورة"))),
          "image/jpeg",
          0.9
        );
      });

      const response = await fetch("/api/story/publish", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + $("admin").value.trim(),
          "Content-Type": "image/jpeg"
        },
        body: blob
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "فشل نشر القصة");

      showStatus("storyStatus", "تم نشر القصة: " + data.id, "ok");

    } catch (error) {
      showStatus("storyStatus", error.message, "err");
    } finally {
      button.disabled = false;
    }
  }

  async function saveAutoStory() {
    try {
      await api("/api/settings/auto-story", "POST", {
        enabled: $("autoStory").checked
      });
    } catch (error) {
      alert(error.message);
      $("autoStory").checked = !$("autoStory").checked;
    }
  }

  /* ---------- الريلز ---------- */

  let reelFileObj = null;
  let reelVideoId = null;

  function reelPick() {
    const file = $("reelFile").files[0];

    reelFileObj = null;
    $("reelPublishBtn").disabled = true;
    $("reelInfo").textContent = "";

    if (!file) return;

    const mb = (file.size / 1048576).toFixed(1);

    if (file.size > 60 * 1048576) {
      $("reelInfo").textContent = "حجم الملف " + mb + " ميغابايت — أكبر من الحد (60).";
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      const warnings = [];

      if (video.videoHeight <= video.videoWidth) warnings.push("الفيديو ليس رأسياً 9:16");
      if (Math.min(video.videoWidth, video.videoHeight) < 540) warnings.push("الدقة أقل من 540p");
      if (!/mp4/i.test(file.type)) warnings.push("الصيغة ليست mp4");

      $("reelInfo").textContent =
        Math.round(video.duration) + " ثانية — " +
        video.videoWidth + "×" + video.videoHeight + " — " + mb + " ميغابايت" +
        (warnings.length ? "\n⚠️ " + warnings.join("، ") : "");

      URL.revokeObjectURL(video.src);
      reelFileObj = file;
      $("reelPublishBtn").disabled = false;
    };

    video.onerror = () => {
      $("reelInfo").textContent = "تعذر قراءة الفيديو، جرّب ملف mp4.";
      URL.revokeObjectURL(video.src);
    };

    video.src = URL.createObjectURL(file);
  }

  function reelPublish() {
    if (!reelFileObj) return;
    if (!confirm("نشر هذا الريلز على صفحة Facebook؟")) return;

    const button = $("reelPublishBtn");
    button.disabled = true;
    $("reelCheckBtn").style.display = "none";
    showStatus("reelStatus", "جاري الرفع... 0%");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/reel/publish");
    xhr.setRequestHeader("Authorization", "Bearer " + $("admin").value.trim());
    xhr.setRequestHeader("Content-Type", reelFileObj.type || "video/mp4");
    xhr.setRequestHeader(
      "X-Description",
      encodeURIComponent($("reelCaption").value.trim().slice(0, 800))
    );

    xhr.upload.onprogress = e => {
      if (e.lengthComputable) {
        const pct = Math.round(e.loaded / e.total * 100);
        showStatus(
          "reelStatus",
          pct < 100 ? "جاري الرفع... " + pct + "%" : "اكتمل الرفع، جاري النشر على Facebook..."
        );
      }
    };

    xhr.onload = () => {
      button.disabled = false;

      try {
        const data = JSON.parse(xhr.responseText);

        if (xhr.status >= 400 || !data.ok) {
          throw new Error(data.error || "فشل نشر الريلز");
        }

        reelVideoId = data.video_id;
        showStatus("reelStatus", "تم إرسال الريلز (" + data.video_id + "). قد تستغرق المعالجة دقائق.", "ok");
        $("reelCheckBtn").style.display = "block";

      } catch (error) {
        showStatus("reelStatus", error.message, "err");
      }
    };

    xhr.onerror = () => {
      button.disabled = false;
      showStatus("reelStatus", "انقطع الاتصال أثناء الرفع", "err");
    };

    xhr.send(reelFileObj);
  }

  async function reelCheck() {
    if (!reelVideoId) return;

    try {
      const data = await api("/api/reel/status?id=" + reelVideoId);
      const st = data.status || {};
      const err = st.processing_phase?.error?.message;

      showStatus(
        "reelStatus",
        "الحالة: " + (st.video_status || "غير معروفة") +
          (err ? "\nخطأ: " + err : ""),
        err ? "err" : ""
      );
    } catch (error) {
      showStatus("reelStatus", error.message, "err");
    }
  }

  /* ---------- إتاحة الدوال لأزرار الصفحة ---------- */

  Object.assign(window, {
    showTab, refreshAll, generate, saveDraft, publishText, copyText,
    clearEditor, loadDrafts, regenerateImage, deleteDraft, publishDraft,
    loadAuto, toggleAuto, setPreset, saveHours, saveRequireImage, testImage,
    storyFindImage, storyDraw, storyPublish, saveAutoStory,
    reelPick, reelPublish, reelCheck
  });

  document.addEventListener("DOMContentLoaded", () => {
    $("message")?.addEventListener("input", preview);
    preview();
    renderHours();
    storyDraw();
  });
})();
