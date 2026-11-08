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
        "تم إنشاء المسودة رقم " + data.id,
        "ok"
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
        category: $("category").value
      });

      showStatus(
        "aiStatus",
        "تم حفظ المسودة رقم " + data.id,
        "ok"
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

        const content = document.createElement("p");
        content.textContent = post.content;

        const actions = document.createElement("div");
        actions.className = "actions";

        const edit = makeButton("تعديل", "secondary", () => {
          $("message").value = post.content;
          preview();
          $("message").scrollIntoView({ behavior: "smooth" });
        });

        const publish = makeButton("نشر", "primary", () => {
          publishDraft(post.id);
        });

        const remove = makeButton("حذف", "danger", () => {
          deleteDraft(post.id);
        });

        actions.append(edit, publish, remove);
        card.append(title, content, actions);
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
      const data = await api("/api/publish", "POST", { message });

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

  // تشغيل المعاينة عند الكتابة
  document.addEventListener("DOMContentLoaded", () => {
    const message = $("message");

    if (message) {
      message.addEventListener("input", preview);
      preview();
    }
  });

})();
