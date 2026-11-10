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

  /* ---------- إتاحة الدوال لأزرار الصفحة ---------- */

  Object.assign(window, {
    showTab, refreshAll, generate, saveDraft, publishText, copyText,
    clearEditor, loadDrafts, regenerateImage, deleteDraft, publishDraft,
    loadAuto, toggleAuto, setPreset, saveHours, saveRequireImage, testImage
  });

  document.addEventListener("DOMContentLoaded", () => {
    $("message")?.addEventListener("input", preview);
    preview();
    renderHours();
  });
})();
