"use strict";

(() => {
  const $ = id => document.getElementById(id);
  let hours = [];
  let blogHours = [];

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
      if (data.wikiContact === false) {
        showStatus(
          "autoStatus",
          "تنبيه: متغير WIKI_CONTACT غير مضبوط — أضف بريدك الحقيقي في إعدادات العامل حتى لا ترفض ويكيميديا طلبات الصور",
          "err"
        );
      }
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

    await Promise.all([stats(), loadDrafts(), loadAuto(), blogCheck(), loadTopics(), loadAnalytics(), loadCalendar()]);
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

        const schedRow = document.createElement("div");
        schedRow.className = "row";

        const dt = document.createElement("input");
        dt.type = "datetime-local";
        dt.step = 3600;
        dt.style.flex = "1";
        dt.title = "موعد النشر بتوقيت القاهرة";

        schedRow.append(
          dt,
          makeButton("جدولة", "secondary", () => scheduleDraft(post.id, dt.value))
        );

        card.append(title, thumb, content, actions, schedRow);
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

  /* ---------- الجدولة والتقويم (بتوقيت القاهرة) ---------- */

  function cairoPartsOf(date) {
    return Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit",
        year: "numeric", month: "2-digit", day: "2-digit", hourCycle: "h23"
      }).formatToParts(date).map(x => [x.type, x.value])
    );
  }

  function cairoOffsetMs(date) {
    const p = cairoPartsOf(date);
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) -
      (date.getTime() - (date.getTime() % 60000));
  }

  function cairoLocalToUtcIso(local) {
    const m = String(local || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;

    const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    const utc = new Date(wall - cairoOffsetMs(new Date(wall - cairoOffsetMs(new Date(wall)))));
    return utc.toISOString();
  }

  function cairoDayKey(date) {
    const p = cairoPartsOf(date);
    return p.year + "-" + p.month + "-" + p.day;
  }

  function fmtCairoDay(date) {
    return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
      timeZone: "Africa/Cairo", weekday: "long", day: "numeric", month: "short"
    }).format(date);
  }

  function fmtCairoTime(iso) {
    return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
      timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(new Date(iso));
  }

  /* published_at من D1 بتنسيق UTC بلا لاحقة منطقة */
  function parseUtc(v) {
    return new Date(String(v).replace(" ", "T") + (String(v).includes("T") ? "" : "") + (String(v).endsWith("Z") ? "" : "Z"));
  }

  async function scheduleDraft(id, localValue) {
    const at = cairoLocalToUtcIso(localValue);

    if (!at) {
      alert("اختر تاريخاً وساعة للنشر");
      return;
    }

    try {
      await api("/api/schedule-draft", "POST", { id, at });
      await Promise.all([loadDrafts(), loadCalendar()]);
    } catch (error) {
      alert(error.message);
    }
  }

  async function unscheduleDraft(id) {
    try {
      await api("/api/unschedule-draft", "POST", { id });
      await Promise.all([loadDrafts(), loadCalendar()]);
    } catch (error) {
      alert(error.message);
    }
  }

  async function loadCalendar() {
    try {
      const data = await api("/api/calendar");
      renderScheduled(data.scheduled || []);
      renderCalendar(data);
    } catch (error) {
      console.error("Calendar:", error);
    }
  }

  function renderScheduled(items) {
    const box = $("scheduledList");
    if (!box) return;
    box.replaceChildren();

    if (!items.length) {
      box.textContent = "لا توجد منشورات مجدولة — جدول أي مسودة من الأسفل.";
      return;
    }

    items.forEach(post => {
      const card = el("div", "post");
      const title = String(post.content || "").split("\n").map(x => x.trim()).find(Boolean) || ("منشور #" + post.id);

      card.appendChild(el("b", "", fmtCairoDay(parseUtc(post.scheduled_at)) + " — " + fmtCairoTime(post.scheduled_at)));
      card.appendChild(el("p", "", title));

      const actions = el("div", "row");
      actions.append(
        makeButton("نشر الآن", "primary", async () => {
          if (!confirm("نشر هذا المنشور المجدول الآن؟")) return;
          try {
            const data = await api("/api/publish-draft", "POST", { id: post.id });
            alert("تم النشر بنجاح: " + data.id);
            await Promise.all([loadCalendar(), stats()]);
          } catch (error) {
            alert(error.message);
          }
        }),
        makeButton("إلغاء الجدولة", "secondary", () => unscheduleDraft(post.id))
      );
      card.appendChild(actions);
      box.appendChild(card);
    });
  }

  function renderCalendar(data) {
    const grid = $("calGrid");
    if (!grid) return;
    grid.replaceChildren();

    const hours = data.hours || [];
    const scheduled = data.scheduled || [];
    const published = data.published || [];

    const days = [];
    const seen = new Set();
    let d = new Date();

    while (days.length < 7) {
      const key = cairoDayKey(d);
      if (!seen.has(key)) {
        seen.add(key);
        days.push(new Date(d));
      }
      d = new Date(d.getTime() + 86400000);
    }

    days.forEach(day => {
      const key = cairoDayKey(day);
      const cell = el("div", "calday");
      cell.appendChild(el("b", "", fmtCairoDay(day)));

      hours.forEach(h => cell.appendChild(el("span", "chip", hourLabel(h) + " تلقائي")));

      scheduled
        .filter(x => cairoDayKey(parseUtc(x.scheduled_at)) === key)
        .forEach(x => {
          const title = String(x.content || "").split("\n").map(t => t.trim()).find(Boolean) || ("#" + x.id);
          const chip = el("span", "chip sch", fmtCairoTime(x.scheduled_at) + " " + title.slice(0, 25));
          chip.title = title;
          cell.appendChild(chip);
        });

      published
        .filter(x => x.published_at && cairoDayKey(parseUtc(x.published_at)) === key)
        .forEach(x => {
          const title = String(x.content || "").split("\n").map(t => t.trim()).find(Boolean) || ("#" + x.id);
          const chip = el("span", "chip pub", fmtCairoTime(x.published_at) + " " + title.slice(0, 25));
          chip.title = title;
          cell.appendChild(chip);
        });

      grid.appendChild(cell);
    });
  }

  /* ---------- النشر التلقائي والمواعيد ---------- */

  function renderHours() {
    const grid = $("hoursGrid");
    if (!grid) return;
    grid.replaceChildren();

    for (let h = 0; h < 24; h++) {
      const state = blogHours.includes(h) ? 2 : hours.includes(h) ? 1 : 0;

      const b = makeButton(
        hourLabel(h) + (state === 2 ? " ✍" : ""),
        state === 2 ? "blog" : state === 1 ? "on" : "",
        () => {
          const next = (state + 1) % 3;
          hours = hours.filter(x => x !== h);
          blogHours = blogHours.filter(x => x !== h);
          if (next >= 1) hours.push(h);
          if (next === 2) blogHours.push(h);
          hours.sort((a, c) => a - c);
          blogHours.sort((a, c) => a - c);
          renderHours();
        }
      );
      grid.append(b);
    }

    $("hoursSummary").textContent = hours.length
      ? "منشورات يومياً: " + hours.length +
        (blogHours.length ? " — منها مقالات: " + blogHours.length : "")
      : "لم تختر أي ساعة";
  }

  function setPreset(list, blogList = []) {
    hours = [...list];
    blogHours = [...blogList];
    renderHours();
  }

  async function saveHours() {
    try {
      const data = await api("/api/auto/hours", "POST", { hours, blogHours });
      hours = data.hours;
      blogHours = data.blogHours || [];
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
        (data.enabled ? "النشر التلقائي مفعّل" : "النشر التلقائي متوقف") +
          (data.draftMode ? " — وضع المسودات: تُحفظ المنشورات للمراجعة قبل النشر" : ""),
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
      blogHours = data.blogHours || [];
      renderHours();

      if (blogHours.length && !data.blogReady) {
        showStatus(
          "hoursStatus",
          "⚠️ حددت مواعيد للمقالات لكن إعدادات جوجل غير مكتملة، فلن تُنشر.",
          "err"
        );
      }

      $("requireImage").checked = data.requireImage !== false;
      $("autoStory").checked = data.autoStory === true;
      $("fallbackCount").textContent = data.fallbackCount ?? 0;
      showStatus(
        "notifyStatus",
        data.notifyReady ? "التنبيهات مفعّلة" : "التنبيهات غير مفعّلة (أضف متغيرات تيليجرام)",
        data.notifyReady ? "ok" : ""
      );

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

  async function addFallback() {
    const page = $("fallbackUrl").value.trim();

    if (!page) {
      showStatus("fallbackStatus", "الصق رابط صفحة الملف أولاً", "err");
      return;
    }

    showStatus("fallbackStatus", "جاري التحقق من الصورة...");

    try {
      const d = await api("/api/fallback/add", "POST", { page });
      $("fallbackUrl").value = "";
      $("fallbackCount").textContent = d.count;
      showStatus("fallbackStatus", "تمت الإضافة (" + d.license + ")", "ok");
    } catch (error) {
      showStatus("fallbackStatus", error.message, "err");
    }
  }

  /* ---------- المواضيع والتنبيهات ---------- */

  async function loadTopics() {
    try {
      const d = await api("/api/topics");

      $("builtinCount").textContent = d.builtinCount;
      $("useBuiltin").checked = d.useBuiltin;

      const box = $("topicsList");
      box.replaceChildren();

      if (!d.items.length) {
        box.append(Object.assign(document.createElement("p"), {
          className: "muted",
          textContent: "لا توجد مواضيع مضافة بعد."
        }));
        return;
      }

      d.items.forEach(t => {
        const row = document.createElement("div");
        row.className = "log";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.gap = "8px";

        const text = document.createElement("span");
        text.textContent = t.topic + " ";

        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = t.category;
        text.append(chip);

        row.append(text, makeButton("حذف", "danger", () => deleteTopic(t.id)));
        box.append(row);
      });
    } catch (error) {
      showStatus("topicsStatus", error.message, "err");
    }
  }

  async function addTopics() {
    const topics = $("topicsText").value.split("\n").map(x => x.trim()).filter(Boolean);

    if (!topics.length) {
      showStatus("topicsStatus", "اكتب موضوعاً واحداً على الأقل", "err");
      return;
    }

    try {
      const d = await api("/api/topics/add", "POST", {
        category: $("topicCategory").value,
        topics
      });

      $("topicsText").value = "";
      showStatus(
        "topicsStatus",
        "تمت إضافة " + d.added + (d.skipped ? " — مكرر: " + d.skipped : ""),
        "ok"
      );
      await loadTopics();
    } catch (error) {
      showStatus("topicsStatus", error.message, "err");
    }
  }

  async function deleteTopic(id) {
    try {
      await api("/api/topics/delete", "POST", { id });
      await loadTopics();
    } catch (error) {
      alert(error.message);
    }
  }

  async function saveBuiltin() {
    try {
      await api("/api/settings/builtin-topics", "POST", {
        enabled: $("useBuiltin").checked
      });
    } catch (error) {
      alert(error.message);
      $("useBuiltin").checked = !$("useBuiltin").checked;
    }
  }

  async function testNotify() {
    showStatus("notifyStatus", "جاري الإرسال...");

    try {
      await api("/api/notify/test", "POST", {});
      showStatus("notifyStatus", "تم الإرسال. تحقق من تيليجرام.", "ok");
    } catch (error) {
      showStatus("notifyStatus", error.message, "err");
    }
  }

  /* ---------- المدونة ---------- */

  let blogImage = null;

  async function blogCheck() {
    try {
      const d = await api("/api/blog/status");

      if (!d.configured) {
        showStatus("blogConn", "إعدادات جوجل غير مكتملة: أضف أسرار GOOGLE_* في Cloudflare.", "err");
      } else if (d.connected) {
        showStatus("blogConn", "متصل بالمدونة: " + d.name, "ok");
      } else {
        showStatus("blogConn", "تعذر الاتصال بالمدونة: " + d.error, "err");
      }
    } catch (error) {
      showStatus("blogConn", error.message, "err");
    }
  }

  function blogPreview() {
    const img = blogImage?.url
      ? '<img src="' + blogImage.url + '" style="max-width:100%;border-radius:8px">'
      : "";

    $("blogFrame").srcdoc =
      '<html dir="rtl"><body style="font-family:Tahoma,Arial;line-height:1.9;padding:10px">' +
      img + $("blogBody").value + "</body></html>";
  }

  async function blogGenerate() {
    const topic = $("blogTopic").value.trim();

    if (!topic) {
      showStatus("blogGenStatus", "اكتب الموضوع أولاً", "err");
      return;
    }

    const button = $("blogGenBtn");
    button.disabled = true;
    showStatus("blogGenStatus", "جاري كتابة المقال والبحث عن صورة... قد يستغرق دقيقة");

    try {
      const data = await api("/api/blog/generate", "POST", {
        topic,
        category: $("blogCategory").value
      });

      blogImage = data.image || null;
      $("blogTitle").value = data.title;
      $("blogBody").value = data.body;

      const img = $("blogImg");
      if (blogImage?.url) {
        img.src = blogImage.url;
        img.style.display = "block";
      } else {
        img.style.display = "none";
      }

      blogPreview();
      showStatus("blogGenStatus", "تم إنشاء المقال. راجعه ثم انشره من البطاقة التالية.", "ok");

    } catch (error) {
      showStatus("blogGenStatus", error.message, "err");
    } finally {
      button.disabled = false;
    }
  }

  async function blogPublish(share) {
    const title = $("blogTitle").value.trim();
    const body = $("blogBody").value.trim();

    if (!title || !body) {
      showStatus("blogPubStatus", "اكتب العنوان والمقال أولاً", "err");
      return;
    }

    if (!confirm(share
      ? "نشر المقال على المدونة ثم مشاركته على فيسبوك؟"
      : "نشر المقال على المدونة؟")) return;

    showStatus("blogPubStatus", "جاري النشر...");

    try {
      const data = await api("/api/blog/publish", "POST", {
        title,
        body,
        image: blogImage,
        category: $("blogCategory").value,
        topic: $("blogTopic").value.trim(),
        share
      });

      let text = "تم النشر على المدونة:\n" + data.blog_url;

      if (share) {
        text += data.fb_id
          ? "\nوتمت مشاركته على فيسبوك: " + data.fb_id
          : "\n⚠️ تعذرت المشاركة على فيسبوك: " + data.fbError;
      }

      showStatus("blogPubStatus", text, share && !data.fb_id ? "err" : "ok");

    } catch (error) {
      showStatus("blogPubStatus", error.message, "err");
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

  /* ---------- الإحصاءات ---------- */

  function fmtNum(n) {
    const v = Math.round(Number(n) || 0);
    return v >= 10000 ? (v / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(v);
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function loadAnalytics() {
    try {
      const data = await api("/api/analytics");
      const sum = data.summary || {};

      $("anaMeasured").textContent = sum.measured ?? 0;
      $("anaReach").textContent = fmtNum(sum.avg_reach);
      $("anaScore").textContent = fmtNum(sum.avg_score);
      $("anaReactions").textContent = fmtNum(sum.reactions);
      $("anaComments").textContent = fmtNum(sum.comments);
      $("anaShares").textContent = fmtNum(sum.shares);

      const catBox = $("anaCategories");
      catBox.replaceChildren();

      const cats = data.categories || [];

      if (!cats.length) {
        catBox.textContent = "لا توجد بيانات بعد — تُجمع المقاييس كل ساعة من المنشورات المنشورة.";
      } else {
        cats.forEach(c => {
          const row = el("div", "acat");
          const name = el("span", "", (c.category || "بدون تصنيف") + " (" + c.posts + ")");
          const val = el("span");
          const b = el("b", "", fmtNum(c.avg_score));
          val.appendChild(b);
          val.appendChild(document.createTextNode(" نقاط · وصول " + fmtNum(c.avg_reach)));
          row.appendChild(name);
          row.appendChild(val);
          catBox.appendChild(row);
        });
      }

      const postBox = $("anaPosts");
      postBox.replaceChildren();

      const posts = data.recent || [];

      if (!posts.length) {
        postBox.textContent = "لا توجد مقاييس بعد.";
      } else {
        posts.forEach(pst => {
          const row = el("div", "apost");
          const title = String(pst.content || "").split("\n").map(x => x.trim()).find(Boolean) || "";
          row.appendChild(el("div", "at", title.slice(0, 120)));
          row.appendChild(el("div", "am",
            "وصول " + fmtNum(pst.reach) + " · إعجاب " + fmtNum(pst.reactions) +
            " · تعليق " + fmtNum(pst.comments) + " · مشاركة " + fmtNum(pst.shares) +
            " · " + fmtNum(pst.score) + " نقاط"));
          postBox.appendChild(row);
        });
      }
    } catch (error) {
      console.error("Analytics:", error);
    }
  }

  async function refreshAnalytics() {
    showStatus("anaStatus", "جاري جمع المقاييس من فيسبوك…");

    try {
      const data = await api("/api/analytics/refresh", "POST", {});
      let msg = "تم فحص " + (data.scanned ?? 0) + " منشوراً";

      if (data.failed) msg += " (" + data.failed + " فشل" + (data.lastError ? ": " + data.lastError : "") + ")";
      if (data.insightsError) msg += " — الوصول غير متاح: " + data.insightsError;

      showStatus("anaStatus", msg, data.failed ? "err" : "ok");
      await loadAnalytics();
    } catch (error) {
      showStatus("anaStatus", error.message, "err");
    }
  }

  /* ---------- إتاحة الدوال لأزرار الصفحة ---------- */

  Object.assign(window, {
    showTab, refreshAll, generate, saveDraft, publishText, copyText,
    clearEditor, loadDrafts, regenerateImage, deleteDraft, publishDraft,
    loadAuto, toggleAuto, setPreset, saveHours, saveRequireImage, testImage,
    storyFindImage, storyDraw, storyPublish, saveAutoStory,
    reelPick, reelPublish, reelCheck, addFallback,
    blogCheck, blogPreview, blogGenerate, blogPublish,
    addTopics, saveBuiltin, testNotify, loadAnalytics, refreshAnalytics,
    scheduleDraft, unscheduleDraft, loadCalendar
  });

  document.addEventListener("DOMContentLoaded", () => {
    $("message")?.addEventListener("input", preview);
    preview();
    renderHours();
    storyDraw();
  });
})();
