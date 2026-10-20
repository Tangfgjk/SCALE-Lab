(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var api = window.scaleAdmin.api, esc = window.scaleAdmin.escapeHtml;
  var form = $("album-form"), currentId = null, version = null, activeLocale = "zh", checked = false, published = false, dirty = false, images = [];
  function msg(text, error) { $("album-message").textContent = text; $("album-message").classList.toggle("error", !!error); }
  function buttons() {
    $("album-check").disabled = !currentId || checked || dirty;
    $("album-preview").disabled = !currentId || dirty;
    $("album-publish").disabled = !currentId || !checked || dirty;
    $("album-withdraw").disabled = !currentId || !published || dirty;
  }
  function markDirty() { dirty = true; buttons(); msg("表单有未保存改动，请先保存草稿。"); }
  function reset() {
    form.reset(); form.elements.slug.disabled = false; currentId = null; version = null; activeLocale = "zh"; checked = false; published = false; dirty = false; images = [];
    $("album-editor-title").textContent = "新建相册"; $("album-preview-box").hidden = true; $("album-history").textContent = ""; msg("");
    $("album-list-card").hidden = true; $("album-editor-card").hidden = false; renderImages(); buttons();
  }
  var contentList = window.ScaleContentList.create({ cardId: "album-list-card", listId: "album-list", searchId: "album-search", endpoint: function() { return "/api/admin/v1/activities"; }, open: open });
  function list() { return contentList.load(); }

  function renderImages() {
    var node = $("album-images"); node.replaceChildren();
    if (!images.length) { node.innerHTML = '<div class="empty">暂无图片；保存草稿可以稍后添加，发布前至少需要一张已核准图片。</div>'; return; }
    images.forEach(function (image, index) {
      var row = document.createElement("div"); row.className = "album-image";
      row.innerHTML = '<img src="/api/admin/v1/assets/' + encodeURIComponent(image.assetId) + '/file" alt="">' +
        '<label>' + (index === 0 ? "封面 · " : "图片 " + (index + 1) + " · ") + '逐图说明<input type="text" maxlength="500" value="' + esc(image.caption || "") + '"></label>' +
        '<div class="album-image-actions"><button type="button" data-action="up" aria-label="上移">↑</button><button type="button" data-action="down" aria-label="下移">↓</button><button type="button" data-action="remove">移除</button></div>';
      row.querySelector("input").addEventListener("input", function (event) { image.caption = event.target.value; markDirty(); });
      row.querySelectorAll("button").forEach(function (button) { button.addEventListener("click", function () {
        var action = button.dataset.action;
        if (action === "remove") images.splice(index, 1);
        else if (action === "up" && index > 0) [images[index - 1], images[index]] = [images[index], images[index - 1]];
        else if (action === "down" && index < images.length - 1) [images[index + 1], images[index]] = [images[index], images[index + 1]];
        renderImages(); markDirty();
      }); });
      node.appendChild(row);
    });
  }
  async function open(id, locale) {
    try {
      var row = await api("/api/admin/v1/activities/" + id + "?locale=" + (locale || "zh"));
      reset(); currentId = row.id; version = row.version; activeLocale = row.locale; checked = row.reviewState === "ready"; published = row.published;
      ["slug", "locale", "title", "summary", "body", "activityDate", "location", "sourceUrl", "sourceNote"].forEach(function (name) { form.elements[name].value = row[name] || ""; });
      images = (row.images || []).map(function (image) { return { assetId: image.assetId, caption: image.caption || "" }; });
      form.elements.slug.disabled = true; dirty = false; $("album-editor-title").textContent = "编辑相册 · " + (row.locale === "en" ? "English" : "中文") + " · v" + version;
      renderImages(); buttons(); history();
    } catch (error) { msg(error.message, true); }
  }
  async function history() {
    try { var rows = await api("/api/admin/v1/activities/" + currentId + "/revisions"); $("album-history").innerHTML = '<strong>修订历史</strong><br>' + rows.map(function (row) { return '<span>v' + row.version + ' · ' + (row.locale === "en" ? "EN" : "中") + ' · ' + esc(row.title) + (row.published ? " · 已公开" : "") + '</span>'; }).join(""); }
    catch (error) { $("album-history").textContent = error.message; }
  }
  function payload() { return { ...Object.fromEntries(new FormData(form).entries()), images: images.map(function (image) { return { assetId: image.assetId, caption: image.caption }; }), expectedVersion: version }; }
  async function action(suffix, success) {
    try { await api("/api/admin/v1/activities/" + currentId + suffix, { method: "POST", body: JSON.stringify({ expectedVersion: version, locale: activeLocale }) }); await open(currentId, activeLocale); await list(); msg(success); }
    catch (error) { msg(error.message, true); }
  }
  $("album-new").addEventListener("click", reset);
  $("album-close").addEventListener("click", function () { $("album-editor-card").hidden = true; $("album-list-card").hidden = false; list(); });
  $("album-search").addEventListener("input", function () { clearTimeout(window.albumSearchTimer); window.albumSearchTimer = setTimeout(list, 250); });
  $("album-add-image").addEventListener("click", async function () {
    var asset=await window.ScaleMedia.pick();if(!asset) return;var id=asset.id;
    if (images.some(function (image) { return image.assetId === id; })) { msg("该图片已在相册中。", true); return; }
    if (images.length >= 30) { msg("一个相册最多 30 张图片。", true); return; }
    images.push({ assetId: id, caption: "" }); renderImages(); markDirty();
  });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    try { var data = payload(); var result = await api(currentId ? "/api/admin/v1/activities/" + currentId + "/draft" : "/api/admin/v1/activities", { method: currentId ? "PUT" : "POST", body: JSON.stringify(data) }); await open(result.id, data.locale); await list(); msg("草稿已保存。图片授权核对后可发布。"); }
    catch (error) { msg(error.message, true); }
  });
  form.addEventListener("input", function (event) { if (event.target.name === "locale") return; markDirty(); });
  form.elements.locale.addEventListener("change", function () {
    var next = form.elements.locale.value;
    if (!currentId || dirty) { form.elements.locale.value = activeLocale; msg(currentId ? "请先保存当前语言的改动。" : "请先创建中文相册。", true); return; }
    open(currentId, next);
  });
  $("album-check").addEventListener("click", function () { action("/check", "当前语言相册已核查。"); });
  $("album-publish").addEventListener("click", function () { action("/publish", "相册已发布到公开接口。"); });
  $("album-withdraw").addEventListener("click", function () { action("/withdraw", "相册已撤回。"); });
  $("album-preview").addEventListener("click", async function () {
    try {
      var row = await api("/api/admin/v1/activities/" + currentId + "/preview?locale=" + activeLocale);
      $("album-preview-box").innerHTML = '<h3>' + esc(row.title) + '</h3><p>' + esc(row.activityDate) + ' · ' + esc(row.location) + '</p><p>' + esc(row.summary) + '</p>' +
        '<div class="album-preview-body">' + (row.body || '').split(/\r?\n\s*\r?\n/).filter(Boolean).map(function (paragraph) { return '<p>' + esc(paragraph).replace(/\r?\n/g, '<br>') + '</p>'; }).join('') + '</div>' +
        row.images.map(function (image) { return '<div class="album-image"><img src="/api/admin/v1/assets/' + encodeURIComponent(image.assetId) + '/file" alt=""><span>' + esc(image.caption) + '</span></div>'; }).join("");
      $("album-preview-box").hidden = false;
    } catch (error) { msg(error.message, true); }
  });
  window.albumAdmin = { show: function () { $("album-editor-card").hidden = true; $("album-list-card").hidden = false; $("album-search").value = ""; contentList.reset(); list(); } };
})();
