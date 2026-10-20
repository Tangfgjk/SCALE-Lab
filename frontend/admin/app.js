(function () {
  "use strict";
  var csrf = "", currentId = null, version = null, checked = false, published = false, dirty = false, activeLocale = "zh";
  var $ = function (id) { return document.getElementById(id); };
  var form = $("news-form");
  var richEditor = null, newsMedia = {};
  var currentPublished = false, busy = false;

  function escapeHtml(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  async function api(path, options, withMeta) {
    options = options || {};
    options.headers = Object.assign(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }, options.headers || {});
    if (options.method && options.method !== "GET") options.headers["x-csrf-token"] = csrf;
    var response = await fetch(path, Object.assign({ credentials: "same-origin" }, options));
    var value = await response.json();
    if (!response.ok) throw new Error((value.error && value.error.message) || "请求失败");
    return withMeta ? value : value.data;
  }
  function message(text, error, target) { var node = $(target || "editor-message"); node.textContent = text; node.classList.toggle("error", !!error); }
  function showLogin() { $("login").hidden = false; $("workspace").hidden = true; csrf = ""; }
  function showWorkspace(user) { csrf = user.csrfToken; window.scaleAdmin.currentUser = user; $("user-name").textContent = user.displayName; $("account-users-card").hidden = user.role !== "admin"; $("account-create-card").hidden = user.role !== "admin"; $("accounts-description").textContent = user.role === "admin" ? "仅管理员可创建、停用账号和重置密码。启用账号最多 5 个；所有账号均可编辑和发布内容。" : "你可以在此修改自己的登录密码；其他账号由管理员维护。"; $("login").hidden = true; $("workspace").hidden = false; loadNews(); }
  function publicLink(slug, locale) { return "/news.html?slug=" + encodeURIComponent(slug) + "&lang=" + (locale === "en" ? "en" : "zh"); }
  var newsList = window.ScaleContentList.create({ cardId: "list-card", listId: "news-list", searchId: "search", endpoint: function() { return "/api/admin/v1/news"; }, open: openNews, news: true });
  function loadNews() { return newsList.load(); }
  function setBusy(value) {
    busy = value; form.inert = value; $("news-fields").disabled = value;
    form.setAttribute("aria-busy", String(value));
    ["new-news", "close-editor", "news-quick-save", "logout"].forEach(function(id) { $(id).disabled = value; });
    updateButtons();
  }
  function updateButtons() {
    var mediaIssues = getMediaIssues();
    $("news-save").disabled = busy; $("news-quick-save").disabled = busy;
    $("check").disabled = busy || !currentId || checked || dirty;
    $("preview").disabled = busy || !currentId || dirty;
    $("publish").disabled = busy || currentPublished || !currentId || !checked || dirty || mediaIssues.length > 0;
    $("withdraw").disabled = busy || !currentId || !published || dirty;
    $("news-media-status").textContent = mediaIssues.length ? "以下图片已停用或授权不完整：" + mediaIssues.map(function(id) { return newsMedia[id]?.displayName || id; }).join("、") + "。请在媒体库处理后重新打开新闻。" : "";
    $("news-media-status").classList.toggle("error", mediaIssues.length > 0);
    $("news-workflow").textContent = busy ? "正在处理，请稍候…" : dirty ? (published ? "有未保存改动；网站仍展示原公开版本。" : "有未保存改动，请先保存草稿。") : currentPublished ? "当前修订已公开。修改后保存草稿，再核查并发布才能更新网站。" : published ? "新草稿尚未发布；网站仍展示原公开版本。" : checked ? "当前修订已核查，可以发布。" : "草稿未公开：保存 → 核查当前修订 → 发布。";
    $("news-sticky-state").textContent = busy ? "正在处理…" : dirty ? "有未保存改动" : currentPublished ? "当前修订已发布" : "草稿 · 尚未发布";
    $("news-public-link").hidden = !published;
    if (published) $("news-public-link").href = publicLink(form.elements.slug.value, activeLocale);
  }
  function getMediaIssues() {
    var ids = new Set();
    if (form.elements.coverAssetId.value) ids.add(form.elements.coverAssetId.value);
    function visit(node) {
      if (node.type === "image" && node.attrs?.assetId) ids.add(node.attrs.assetId);
      (node.content || []).forEach(visit);
    }
    if (richEditor) visit(richEditor.getJSON());
    return [...ids].filter(function (id) { return newsMedia[id]?.available !== true; });
  }
  function syncRichText() {
    if (!richEditor) return;
    var value = richEditor.getJSON();
    form.elements.richText.value = JSON.stringify(value);
    form.elements.body.value = richEditor.getText();
    return value;
  }
  function initRichEditor(value, body) {
    if (!window.ScaleRichEditor) return;
    if (richEditor) richEditor.destroy();
    richEditor = window.ScaleRichEditor.create({
      element: $("news-rich-editor"), toolbar: $("news-rich-toolbar"),
      value: value || null, body: body || "", media:newsMedia,
      onChange: function (json, text) {
        form.elements.richText.value = JSON.stringify(json); form.elements.body.value = text;
        dirty = true; updateButtons(); renderLiveArticle(); message("正文有未保存的改动，请先保存草稿。");
      }
    });
    syncRichText();
  }
  function resetEditor() {
    form.reset();
    newsMedia={};
    var today = new Date();
    var date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
    form.elements.happenedAt.value = date;
    form.elements.slug.value = "news-" + date.replace(/-/g, "") + "-" + Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, "0");
    form.elements.slug.disabled = false; currentId = null; version = null; checked = false; published = false; currentPublished = false; dirty = false; activeLocale = "zh";
    initRichEditor(null, "");
    renderLiveArticle();
    $("editor-title").textContent = "新建新闻/活动"; $("preview-box").hidden = true; $("history").textContent = ""; message(""); updateButtons();
    $("list-card").hidden = true; $("editor-card").hidden = false;
    $("editor-card").scrollIntoView({block:"start"});
  }
  async function openNews(id, locale) {
    try {
      var row = await api("/api/admin/v1/news/" + id + "?locale=" + (locale || "zh")); resetEditor(); currentId = row.id; version = row.version; checked = row.reviewState === "ready"; published = row.published; currentPublished = row.currentPublished; activeLocale = row.locale;
      ["slug", "locale", "title", "summary", "category", "location", "sourceUrl", "sourceNote"].forEach(function (key) { form.elements[key].value = row[key] || ""; });
      newsMedia=row.media || {};form.elements.coverAssetId.value=row.coverAssetId || "";
      initRichEditor(row.richText, row.body || "");
      form.elements.happenedAt.value = String(row.happenedAt || "").slice(0, 10); form.elements.slug.disabled = true;
      renderLiveArticle();
      dirty = false; $("editor-title").textContent = "编辑" + (row.category === "activity" ? "活动" : "新闻") + " · " + (row.locale === "en" ? "English" : "中文") + " · v" + version; updateButtons(); loadHistory();
    } catch (error) { message(error.message, true); }
  }
  async function loadHistory() {
    if (!currentId) return;
    try { var rows = await api("/api/admin/v1/news/" + currentId + "/revisions"); $("history").innerHTML = '<strong>修订历史</strong><br>' + rows.map(function (r) { return '<span>v' + r.version + ' · ' + escapeHtml(r.title) + (r.published ? ' · 已公开' : '') + '</span>'; }).join(""); } catch (error) { $("history").textContent = error.message; }
  }
  function payload() {
    syncRichText(); var data = Object.fromEntries(new FormData(form).entries()); data.expectedVersion = version; return data;
  }
  function renderLiveArticle() {
    var activity=form.elements.category.value === "activity";
    $("news-location-field").hidden=!activity; form.elements.summary.maxLength=activity ? 1000 : 500;
    var id=form.elements.coverAssetId.value;
    $("news-cover-label").textContent=id ? (newsMedia[id]?.displayName || "已选择封面") : "未设置封面";
    window.ScaleNewsArticle.render($("news-live-article"), {
      title: form.elements.title.value,
      summary: form.elements.summary.value,
      happenedAt: form.elements.happenedAt.value,
      category: form.elements.category.value,
      location: form.elements.location.value,
      coverAssetId: id,
      richText: richEditor?.getJSON() || null
    }, { media: newsMedia, locale: form.elements.locale.value });
    updateButtons();
  }
  $("news-preview-size").onchange=function(){$("live-preview").dataset.size=this.value;};
  $("news-cover-pick").onclick=async function(){
    var asset=await window.ScaleMedia.pick();if(!asset) return;
    newsMedia[asset.id]={...asset,url:"/api/admin/v1/assets/"+asset.id+"/file",alt:asset.altZh,available:asset.status==="active" && asset.copyright && asset.people};
    form.elements.coverAssetId.value=asset.id;dirty=true;renderLiveArticle();message("封面有未保存改动，请保存草稿。");
  };
  $("news-cover-remove").onclick=function(){form.elements.coverAssetId.value="";dirty=true;renderLiveArticle();};
  form.addEventListener("input",renderLiveArticle);
  async function operation(suffix, body, success) {
    if (!currentId || busy || dirty) return;
    setBusy(true);
    try {
      if (suffix === "/publish") {
        var fresh = await api("/api/admin/v1/news/" + currentId + "/preview?locale=" + activeLocale);
        newsMedia = fresh.media || {};
        renderLiveArticle();
        if (getMediaIssues().length) throw new Error("所选图片已停用或授权不完整，请先在媒体库处理。");
      }
      await api("/api/admin/v1/news/" + currentId + suffix, { method: "POST", body: JSON.stringify(body) });
      await openNews(currentId, activeLocale); message(success); loadNews();
    }
    catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  }
  function hasUnsavedNews() { return !$("news-panel").hidden && !$("editor-card").hidden && dirty; }
  function confirmLeaveNews() { if (busy) return false; return !hasUnsavedNews() || window.confirm("当前新闻有未保存的改动，离开将丢失。确定离开？"); }
  function closeNewsEditor() {
    dirty = false;
    $("editor-card").hidden = true;
    $("list-card").hidden = false;
  }
  window.addEventListener("beforeunload", function (event) {
    if (!hasUnsavedNews() && !busy) return;
    event.preventDefault(); event.returnValue = "";
  });
  $("login-form").addEventListener("submit", async function (event) {
    event.preventDefault(); var values = Object.fromEntries(new FormData(event.target).entries());
    try { var user = await api("/api/admin/v1/session", { method: "POST", body: JSON.stringify(values) }); showWorkspace(user); $("login-message").textContent = ""; }
    catch (error) { message(error.message, true, "login-message"); }
  });
  $("logout").addEventListener("click", async function () { if (!confirmLeaveNews()) return; try { await api("/api/admin/v1/session", { method: "DELETE" }); } finally { closeNewsEditor(); showLogin(); } });
  $("new-news").addEventListener("click", function () { if (confirmLeaveNews()) resetEditor(); });
  $("close-editor").addEventListener("click", function () { if (!confirmLeaveNews()) return; closeNewsEditor(); loadNews(); });
  $("search").addEventListener("input", function () { clearTimeout(window.searchTimer); newsList.invalidate(); window.searchTimer = setTimeout(loadNews, 250); });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (busy) return;
    // Read FormData before disabling its fieldset; disabled controls are omitted.
    var data = payload(); setBusy(true);
    try {
      var result = await api(currentId ? "/api/admin/v1/news/" + currentId + "/draft" : "/api/admin/v1/news", { method: currentId ? "PUT" : "POST", body: JSON.stringify(data) });
      await openNews(result.id, data.locale); message(published ? "新草稿已保存，网站仍展示原公开版本。核查并发布后才会更新。" : "草稿已保存，尚未公开。请核查后发布。"); loadNews();
    } catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  });
  form.addEventListener("input", function (event) { if (event.target.name === "locale" || event.target.name === "body" || event.target.name === "richText") return; dirty = true; updateButtons(); message("表单有未保存的改动，请先保存草稿。"); });
  form.elements.locale.addEventListener("change", function () {
    var next = form.elements.locale.value;
    if (!currentId || dirty) { form.elements.locale.value = activeLocale; message(currentId ? "请先保存当前语言的改动。" : "请先创建中文新闻，再编辑英文。", true); return; }
    openNews(currentId, next);
  });
  $("check").addEventListener("click", function () { operation("/check", { expectedVersion: version, locale: form.elements.locale.value }, "当前修订已核查，可以发布。"); });
  $("publish").addEventListener("click", function () { operation("/publish", { expectedVersion: version, locale: form.elements.locale.value }, "已发布到公开网站。"); });
  $("withdraw").addEventListener("click", function () { operation("/withdraw", { expectedVersion: version, locale: form.elements.locale.value }, "已撤回公开内容。"); });
  $("preview").addEventListener("click", async function () {
    try { var row = await api("/api/admin/v1/news/" + currentId + "/preview?locale=" + form.elements.locale.value); window.ScaleNewsArticle.render($("news-saved-article"),row,{media:row.media,locale:row.locale}); $("preview-box").hidden = false; }
    catch (error) { message(error.message, true); }
  });
  document.querySelectorAll("[data-module]").forEach(function (button) { button.addEventListener("click", function () {
    if (button.dataset.module !== "news" && !confirmLeaveNews()) return;
    if (button.dataset.module !== "news" && !$("editor-card").hidden) closeNewsEditor();
    document.querySelectorAll("[data-module]").forEach(function (item) { item.classList.toggle("active", item === button); });
    var module = button.dataset.module; var names = { news: "新闻/活动", members: "团队成员", publications: "论文成果", projects: "科研项目", directions: "研究方向", media: "媒体资源", settings: "站点设置", accounts: "账号管理", audit: "操作记录" };
    var research = ["publications", "projects", "directions"].includes(module);
    $("breadcrumb").textContent = names[module]; $("news-panel").hidden = module !== "news"; $("audit-panel").hidden = module !== "audit"; $("research-panel").hidden = !research; $("member-panel").hidden = module !== "members"; $("media-panel").hidden = module !== "media"; $("settings-panel").hidden = module !== "settings"; $("accounts-panel").hidden = module !== "accounts"; $("other-panel").hidden = module === "news" || module === "audit" || module === "members" || module === "media" || module === "settings" || module === "accounts" || research;
    $("other-title").textContent = names[module]; if (module === "audit") loadAudit(); if (module === "news") loadNews();
    if (research && window.researchAdmin) window.researchAdmin.show(module);
    if (module === "members" && window.memberAdmin) window.memberAdmin.show();
    if (module === "media" && window.mediaAdmin) window.mediaAdmin.show();
    if (module === "settings" && window.settingsAdmin) window.settingsAdmin.show();
    if (module === "accounts" && window.accountsAdmin) window.accountsAdmin.show();
  }); });
  async function loadAudit() { try { var query = new URLSearchParams(new FormData($("audit-filter-form"))); var rows = await api("/api/admin/v1/audit-events?" + query); $("audit-list").innerHTML = rows.length ? rows.map(function (r) { return '<div class="list-row"><div><strong>' + escapeHtml(r.action) + '</strong><small>' + escapeHtml(r.actorName || r.actorLogin || "未知账号") + ' · ' + escapeHtml(new Date(r.created_at).toLocaleString()) + (r.content_id ? ' · 内容 ' + escapeHtml(r.content_id) : '') + '</small></div></div>'; }).join("") : '<div class="empty">暂无记录</div>'; $("audit-message").textContent = "显示 " + rows.length + " 条记录"; } catch (error) { $("audit-message").textContent = error.message; $("audit-message").classList.add("error"); } }
  $("refresh-audit").addEventListener("click", loadAudit);
  $("audit-filter-form").addEventListener("submit", function (event) { event.preventDefault(); loadAudit(); });
  window.scaleAdmin = { api: api, escapeHtml: escapeHtml };
  api("/api/admin/v1/me").then(showWorkspace).catch(showLogin);
})();
