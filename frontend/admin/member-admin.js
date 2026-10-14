(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var api = window.scaleAdmin.api, esc = window.scaleAdmin.escapeHtml;
  var form = $("member-form"), currentId = null, version = null, checked = false, published = false, dirty = false, permission = {}, activeLocale = "zh";
  var names = { profile: "成员档案", bio: "简介", email: "邮箱", destination: "校友去向", photo: "照片" };
  function msg(value, error) { $("member-message").textContent = value; $("member-message").classList.toggle("error", !!error); }
  function buttons() {
    $("member-check").disabled = !currentId || checked || dirty || !permission.profile?.permitted;
    $("member-publish").disabled = !currentId || !checked || dirty || !permission.profile?.permitted;
    $("member-withdraw").disabled = !currentId || !published || dirty;
  }
  function reset() {
    form.reset(); form.elements.slug.disabled = false; currentId = null; version = null; checked = false; published = false; dirty = false; permission = {}; activeLocale = "zh";
    $("member-editor-title").textContent = "新建成员"; $("member-permissions").hidden = true; $("member-history").textContent = ""; msg(""); buttons();
    $("member-list-card").hidden = true; $("member-editor-card").hidden = false;
  }
  async function loadPhotoOptions(selected) {
    var select = form.elements.photoAssetId;
    select.replaceChildren(new Option("不显示照片", ""));
    var assets = await api("/api/admin/v1/assets");
    assets.filter(function (asset) { return asset.status === "active"; }).forEach(function (asset) {
      select.add(new Option((asset.altZh || "未填写说明") + " · " + (asset.credit || "未署名"), asset.id));
    });
    if (selected && !assets.some(function (asset) { return asset.id === selected && asset.status === "active"; })) {
      select.add(new Option("原照片已停用，请重新选择", selected));
    }
    select.value = selected || "";
  }
  async function list() {
    try {
      var rows = await api("/api/admin/v1/members?q=" + encodeURIComponent($("member-search").value));
      var node = $("member-list"); node.replaceChildren();
      if (!rows.length) { node.innerHTML = '<div class="empty">暂无成员资料。录入后默认为待核草稿。</div>'; return; }
      rows.forEach(function (row) {
        var element = document.createElement("div"); element.className = "list-row";
        element.innerHTML = '<div><strong>' + esc(row.nameZh) + '</strong><small>' + esc(row.slug) + ' · ' + esc(row.category) + ' · 修订 v' + row.version + '</small></div><span class="status">' + (row.published ? "已发布" : "草稿") + '</span>';
        var button = document.createElement("button"); button.type = "button"; button.textContent = "编辑"; button.addEventListener("click", function () { open(row.id); });
        element.appendChild(button); node.appendChild(element);
      });
    } catch (error) { $("member-list").innerHTML = '<div class="empty">' + esc(error.message) + '</div>'; }
  }
  function renderPermissions() {
    var node = $("member-permission-list"); node.replaceChildren();
    Object.keys(names).forEach(function (field) {
      var allowed = !!permission[field]?.permitted;
      var row = document.createElement("div"); row.className = "permission-row";
      row.innerHTML = '<div><strong>' + names[field] + '</strong> <span>' + (allowed ? '已授权' : '待核／未授权') + '</span></div>';
      var button = document.createElement("button"); button.type = "button"; button.textContent = allowed ? "撤销授权" : "登记授权";
      button.disabled = field === "photo" && !allowed && !form.elements.photoAssetId.value;
      button.addEventListener("click", function () { changePermission(field, !allowed); });
      row.appendChild(button); node.appendChild(row);
    });
  }
  async function changePermission(field, permitted) {
    var evidenceNote = $("member-evidence").value.trim();
    if (permitted && !evidenceNote) { msg("登记授权前请填写授权依据。", true); $("member-evidence").focus(); return; }
    try {
      var result = await api("/api/admin/v1/members/" + currentId + "/permissions", { method: "POST", body: JSON.stringify({ field: field, permitted: permitted, evidenceNote: evidenceNote }) });
      permission = result.permissions; if (field === "profile" && !permitted) published = false;
      renderPermissions(); buttons(); list(); msg(names[field] + (permitted ? "授权已登记。" : "授权已撤销，公开页面立即隐藏。"));
    } catch (error) { msg(error.message, true); }
  }
  async function open(id, locale) {
    try {
      var row = await api("/api/admin/v1/members/" + id + "?locale=" + (locale || "zh")); reset(); currentId = row.id; version = row.version; checked = row.reviewState === "ready"; published = row.published; permission = row.permissions || {}; activeLocale = row.locale;
      ["slug", "locale", "nameZh", "nameEn", "category", "role", "bio", "homepageUrl", "orcidUrl", "githubUrl", "publicEmail", "destination", "sourceUrl", "sourceNote", "displayOrder"].forEach(function (name) { form.elements[name].value = row[name] == null ? "" : row[name]; });
      form.elements.interestsText.value = (row.interests || []).join("，"); await loadPhotoOptions(row.photoAssetId); form.elements.slug.disabled = true; dirty = false;
      $("member-editor-title").textContent = "编辑成员 · " + (row.locale === "en" ? "English" : "中文") + " · v" + version; $("member-permissions").hidden = false; renderPermissions(); buttons(); history();
    } catch (error) { msg(error.message, true); }
  }
  async function history() {
    try { var rows = await api("/api/admin/v1/members/" + currentId + "/revisions"); $("member-history").innerHTML = '<strong>修订历史</strong><br>' + rows.map(function (row) { return '<span>v' + row.version + ' · ' + (row.locale === "en" ? "EN" : "中") + ' · ' + esc(row.title) + (row.published ? ' · 已公开' : '') + '</span>'; }).join(""); }
    catch (error) { $("member-history").textContent = error.message; }
  }
  function payload() {
    var data = Object.fromEntries(new FormData(form).entries());
    data.interests = (data.interestsText || "").split(/[，,]/).map(function (item) { return item.trim(); }).filter(Boolean); delete data.interestsText;
    data.displayOrder = Number(data.displayOrder || 0); data.expectedVersion = version; return data;
  }
  async function action(suffix, success) {
    try { await api("/api/admin/v1/members/" + currentId + suffix, { method: "POST", body: JSON.stringify({ expectedVersion: version, locale: activeLocale }) }); await open(currentId, activeLocale); msg(success); list(); }
    catch (error) { msg(error.message, true); }
  }
  $("member-new").addEventListener("click", function () { reset(); loadPhotoOptions("").catch(function (error) { msg(error.message, true); }); });
  $("member-close").addEventListener("click", function () { $("member-editor-card").hidden = true; $("member-list-card").hidden = false; list(); });
  $("member-search").addEventListener("input", function () { clearTimeout(window.memberSearchTimer); window.memberSearchTimer = setTimeout(list, 250); });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    try { var data = payload(); var result = await api(currentId ? "/api/admin/v1/members/" + currentId + "/draft" : "/api/admin/v1/members", { method: currentId ? "PUT" : "POST", body: JSON.stringify(data) }); await open(result.id, data.locale); msg("成员草稿已保存。公开前须登记成员档案授权并核查来源。"); list(); }
    catch (error) { msg(error.message, true); }
  });
  form.addEventListener("input", function (event) { if (event.target.name === "locale") return; dirty = true; buttons(); msg("表单有未保存改动，请先保存草稿。"); });
  form.elements.locale.addEventListener("change", function () {
    var next = form.elements.locale.value;
    if (!currentId || dirty) { form.elements.locale.value = activeLocale; msg(currentId ? "请先保存当前语言的改动。" : "请先创建中文档案，再编辑英文。", true); return; }
    open(currentId, next);
  });
  $("member-check").addEventListener("click", function () { action("/check", "当前修订已核查。"); });
  $("member-publish").addEventListener("click", function () { action("/publish", "成员档案已发布；敏感字段仍按各自授权显示。"); });
  $("member-withdraw").addEventListener("click", function () { action("/withdraw", "成员档案已撤回。"); });
  window.memberAdmin = { show: function () { $("member-editor-card").hidden = true; $("member-list-card").hidden = false; $("member-search").value = ""; list(); } };
})();
