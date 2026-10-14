(function () {
  "use strict";
  var csrf = "", currentId = null, version = null, checked = false, published = false, dirty = false, activeLocale = "zh";
  var $ = function (id) { return document.getElementById(id); };
  var form = $("news-form");
  function escapeHtml(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  async function api(path, options) {
    options = options || {};
    options.headers = Object.assign(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }, options.headers || {});
    if (options.method && options.method !== "GET") options.headers["x-csrf-token"] = csrf;
    var response = await fetch(path, Object.assign({ credentials: "same-origin" }, options));
    var value = await response.json();
    if (!response.ok) throw new Error((value.error && value.error.message) || "请求失败");
    return value.data;
  }
  function message(text, error, target) { var node = $(target || "editor-message"); node.textContent = text; node.classList.toggle("error", !!error); }
  function showLogin() { $("login").hidden = false; $("workspace").hidden = true; csrf = ""; }
  function showWorkspace(user) { csrf = user.csrfToken; window.scaleAdmin.currentUser = user; $("user-name").textContent = user.displayName; $("account-users-card").hidden = user.role !== "admin"; $("account-create-card").hidden = user.role !== "admin"; $("accounts-description").textContent = user.role === "admin" ? "仅管理员可创建、停用账号和重置密码。启用账号最多 5 个；所有账号均可编辑和发布内容。" : "你可以在此修改自己的登录密码；其他账号由管理员维护。"; $("login").hidden = true; $("workspace").hidden = false; loadNews(); }
  async function loadNews() {
    try {
      var rows = await api("/api/admin/v1/news?q=" + encodeURIComponent($("search").value));
      var list = $("news-list"); list.replaceChildren();
      if (!rows.length) { list.innerHTML = '<div class="empty">暂无新闻。点击“新建新闻”开始。</div>'; return; }
      rows.forEach(function (row) {
        var el = document.createElement("div"); el.className = "list-row";
        el.innerHTML = '<div><strong>' + escapeHtml(row.title || row.slug) + '</strong><small>' + escapeHtml(row.slug) + ' · 修订 v' + row.version + ' · ' + escapeHtml(row.happened_at || "") + '</small></div><span class="status">' + (row.published_zh ? "已发布" : "草稿") + '</span>';
        var button = document.createElement("button"); button.type = "button"; button.textContent = "编辑"; button.addEventListener("click", function () { openNews(row.id); }); el.appendChild(button); list.appendChild(el);
      });
    } catch (error) { $("news-list").innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>'; }
  }
  function updateButtons() {
    $("check").disabled = !currentId || checked || dirty;
    $("preview").disabled = !currentId || dirty;
    $("publish").disabled = !currentId || !checked || dirty;
    $("withdraw").disabled = !currentId || !published || dirty;
  }
  function resetEditor() {
    form.reset(); form.elements.category.value = "news"; form.elements.happenedAt.value = new Date().toISOString().slice(0, 10);
    form.elements.slug.disabled = false; currentId = null; version = null; checked = false; published = false; dirty = false; activeLocale = "zh";
    $("editor-title").textContent = "新建新闻"; $("preview-box").hidden = true; $("history").textContent = ""; message(""); updateButtons();
    $("list-card").hidden = true; $("editor-card").hidden = false;
  }
  async function openNews(id, locale) {
    try {
      var row = await api("/api/admin/v1/news/" + id + "?locale=" + (locale || "zh")); resetEditor(); currentId = row.id; version = row.version; checked = row.reviewState === "ready"; published = row.published; activeLocale = row.locale;
      ["slug", "locale", "title", "summary", "body", "category", "sourceUrl", "sourceNote"].forEach(function (key) { form.elements[key].value = row[key] || ""; });
      form.elements.happenedAt.value = String(row.happenedAt || "").slice(0, 10); form.elements.slug.disabled = true;
      dirty = false; $("editor-title").textContent = "编辑新闻 · " + (row.locale === "en" ? "English" : "中文") + " · v" + version; updateButtons(); loadHistory();
    } catch (error) { message(error.message, true); }
  }
  async function loadHistory() {
    if (!currentId) return;
    try { var rows = await api("/api/admin/v1/news/" + currentId + "/revisions"); $("history").innerHTML = '<strong>修订历史</strong><br>' + rows.map(function (r) { return '<span>v' + r.version + ' · ' + escapeHtml(r.title) + (r.published ? ' · 已公开' : '') + '</span>'; }).join(""); } catch (error) { $("history").textContent = error.message; }
  }
  function payload() {
    var data = Object.fromEntries(new FormData(form).entries()); data.expectedVersion = version; return data;
  }
  async function operation(suffix, body, success) {
    if (!currentId) return;
    try { await api("/api/admin/v1/news/" + currentId + suffix, { method: "POST", body: JSON.stringify(body) }); await openNews(currentId, activeLocale); message(success); loadNews(); }
    catch (error) { message(error.message, true); }
  }
  $("login-form").addEventListener("submit", async function (event) {
    event.preventDefault(); var values = Object.fromEntries(new FormData(event.target).entries());
    try { var user = await api("/api/admin/v1/session", { method: "POST", body: JSON.stringify(values) }); showWorkspace(user); $("login-message").textContent = ""; }
    catch (error) { message(error.message, true, "login-message"); }
  });
  $("logout").addEventListener("click", async function () { try { await api("/api/admin/v1/session", { method: "DELETE" }); } finally { showLogin(); } });
  $("new-news").addEventListener("click", resetEditor);
  $("close-editor").addEventListener("click", function () { $("editor-card").hidden = true; $("list-card").hidden = false; loadNews(); });
  $("search").addEventListener("input", function () { clearTimeout(window.searchTimer); window.searchTimer = setTimeout(loadNews, 250); });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    try {
      var data = payload(), result = await api(currentId ? "/api/admin/v1/news/" + currentId + "/draft" : "/api/admin/v1/news", { method: currentId ? "PUT" : "POST", body: JSON.stringify(data) });
      await openNews(result.id, data.locale); message("草稿已保存。当前语言版本尚未公开，请核查来源后发布。"); loadNews();
    } catch (error) { message(error.message, true); }
  });
  form.addEventListener("input", function (event) { if (event.target.name === "locale") return; dirty = true; updateButtons(); message("表单有未保存的改动，请先保存草稿。"); });
  form.elements.locale.addEventListener("change", function () {
    var next = form.elements.locale.value;
    if (!currentId || dirty) { form.elements.locale.value = activeLocale; message(currentId ? "请先保存当前语言的改动。" : "请先创建中文新闻，再编辑英文。", true); return; }
    openNews(currentId, next);
  });
  $("check").addEventListener("click", function () { operation("/check", { expectedVersion: version, locale: form.elements.locale.value }, "当前修订已核查，可以发布。"); });
  $("publish").addEventListener("click", function () { operation("/publish", { expectedVersion: version, locale: form.elements.locale.value }, "已发布到公开网站。"); });
  $("withdraw").addEventListener("click", function () { operation("/withdraw", { expectedVersion: version, locale: form.elements.locale.value }, "已撤回公开内容。"); });
  $("preview").addEventListener("click", async function () {
    try { var row = await api("/api/admin/v1/news/" + currentId + "/preview?locale=" + form.elements.locale.value); $("preview-box").innerHTML = '<h3>' + escapeHtml(row.title) + '</h3><small>' + escapeHtml(String(row.happenedAt).slice(0, 10)) + '</small><p>' + escapeHtml(row.summary) + '</p><div>' + escapeHtml(row.body) + '</div>'; $("preview-box").hidden = false; }
    catch (error) { message(error.message, true); }
  });
  document.querySelectorAll("[data-module]").forEach(function (button) { button.addEventListener("click", function () {
    document.querySelectorAll("[data-module]").forEach(function (item) { item.classList.toggle("active", item === button); });
    var module = button.dataset.module; var names = { news: "新闻动态", members: "团队成员", publications: "论文成果", projects: "科研项目", directions: "研究方向", albums: "活动相册", media: "媒体资源", settings: "站点设置", accounts: "账号管理", audit: "操作记录" };
    var research = ["publications", "projects", "directions"].includes(module);
    $("breadcrumb").textContent = names[module]; $("news-panel").hidden = module !== "news"; $("audit-panel").hidden = module !== "audit"; $("research-panel").hidden = !research; $("member-panel").hidden = module !== "members"; $("media-panel").hidden = module !== "media"; $("album-panel").hidden = module !== "albums"; $("settings-panel").hidden = module !== "settings"; $("accounts-panel").hidden = module !== "accounts"; $("other-panel").hidden = module === "news" || module === "audit" || module === "members" || module === "media" || module === "albums" || module === "settings" || module === "accounts" || research;
    $("other-title").textContent = names[module]; if (module === "audit") loadAudit(); if (module === "news") loadNews();
    if (research && window.researchAdmin) window.researchAdmin.show(module);
    if (module === "members" && window.memberAdmin) window.memberAdmin.show();
    if (module === "media" && window.mediaAdmin) window.mediaAdmin.show();
    if (module === "albums" && window.albumAdmin) window.albumAdmin.show();
    if (module === "settings" && window.settingsAdmin) window.settingsAdmin.show();
    if (module === "accounts" && window.accountsAdmin) window.accountsAdmin.show();
  }); });
  async function loadAudit() { try { var query = new URLSearchParams(new FormData($("audit-filter-form"))); var rows = await api("/api/admin/v1/audit-events?" + query); $("audit-list").innerHTML = rows.length ? rows.map(function (r) { return '<div class="list-row"><div><strong>' + escapeHtml(r.action) + '</strong><small>' + escapeHtml(r.actorName || r.actorLogin || "未知账号") + ' · ' + escapeHtml(new Date(r.created_at).toLocaleString()) + (r.content_id ? ' · 内容 ' + escapeHtml(r.content_id) : '') + '</small></div></div>'; }).join("") : '<div class="empty">暂无记录</div>'; $("audit-message").textContent = "显示 " + rows.length + " 条记录"; } catch (error) { $("audit-message").textContent = error.message; $("audit-message").classList.add("error"); } }
  $("refresh-audit").addEventListener("click", loadAudit);
  $("audit-filter-form").addEventListener("submit", function (event) { event.preventDefault(); loadAudit(); });
  window.scaleAdmin = { api: api, escapeHtml: escapeHtml };
  api("/api/admin/v1/me").then(showWorkspace).catch(showLogin);
})();
