(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var api = window.scaleAdmin.api, esc = window.scaleAdmin.escapeHtml;
  var currentId = null, current = null;
  var labels = { copyright: "版权／使用许可", people: "人物公开情况" };
  function msg(id, text, error) { var node = $(id); node.textContent = text; node.classList.toggle("error", !!error); }
  async function list() {
    try {
      var rows = await api("/api/admin/v1/assets");
      var node = $("media-list"); node.replaceChildren();
      if (!rows.length) { node.innerHTML = '<div class="empty">暂无图片。上传后默认为待核，不会自动公开。</div>'; return; }
      rows.forEach(function (row) {
        var button = document.createElement("button"); button.type = "button"; button.className = "media-tile";
        button.innerHTML = '<img src="/api/admin/v1/assets/' + encodeURIComponent(row.id) + '/file" alt=""><span>' + esc(row.altZh || "未填写替代文本") + ' · ' + esc(row.status) + '</span>';
        button.addEventListener("click", function () { open(row.id); }); node.appendChild(button);
      });
    } catch (error) { msg("media-upload-message", error.message, true); }
  }
  async function open(id) {
    try {
      current = await api("/api/admin/v1/assets/" + id); currentId = id;
      $("media-editor").hidden = false; $("media-preview").src = "/api/admin/v1/assets/" + encodeURIComponent(id) + "/file";
      $("media-preview").alt = current.altZh || "待核图片";
      ["altZh", "altEn", "credit", "sourceNote"].forEach(function (name) { $("media-meta-form").elements[name].value = current[name] || ""; });
      $("media-status").textContent = "状态：" + ({ pending: "待核", active: "已启用", disabled: "已停用" }[current.status] || current.status) + " · " + current.width + " × " + current.height;
      renderClearances();
      var usages = await api("/api/admin/v1/assets/" + id + "/usages");
      $("media-usages").textContent = usages.length ? "引用记录：" + usages.map(function (item) { return item.slug + " v" + item.version + (item.publishedLocale ? " · 已发布 " + item.publishedLocale : ""); }).join("；") : "暂无相册引用";
      msg("media-detail-message", "");
    } catch (error) { msg("media-detail-message", error.message, true); }
  }
  function renderClearances() {
    var byType = Object.fromEntries((current.clearances || []).map(function (row) { return [row.type, row]; }));
    var node = $("media-clearances"); node.replaceChildren();
    Object.keys(labels).forEach(function (type) {
      var cleared = !!byType[type]?.allowed;
      var row = document.createElement("div"); row.className = "permission-line";
      row.innerHTML = '<div><strong>' + labels[type] + '</strong><small>' + (cleared ? "已记录可公开依据" : "待核／已撤销") + '</small></div>';
      var button = document.createElement("button"); button.type = "button"; button.textContent = cleared ? "撤销" : "登记可公开";
      button.addEventListener("click", function () { clearance(type, !cleared); }); row.appendChild(button); node.appendChild(row);
    });
  }
  async function clearance(type, allowed) {
    var evidenceNote = $("media-evidence").value.trim();
    if (allowed && !evidenceNote) { msg("media-detail-message", "请先填写授权或无可识别人物的核对依据。", true); return; }
    try {
      await api("/api/admin/v1/assets/" + currentId + "/clearances", { method: "POST", body: JSON.stringify({ type: type, allowed: allowed, evidenceNote: evidenceNote }) });
      await open(currentId); await list(); msg("media-detail-message", allowed ? "公开依据已登记。" : "授权已撤销，公开图片立即下线。");
    } catch (error) { msg("media-detail-message", error.message, true); }
  }
  $("media-upload-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    try {
      var result = await api("/api/admin/v1/assets", { method: "POST", body: new FormData(event.target) });
      event.target.reset(); await list(); await open(result.id); msg("media-upload-message", "图片已上传为待核，尚未公开。");
    } catch (error) { msg("media-upload-message", error.message, true); }
  });
  $("media-meta-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    try {
      await api("/api/admin/v1/assets/" + currentId, { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) });
      await open(currentId); await list(); msg("media-detail-message", "图片资料已保存。");
    } catch (error) { msg("media-detail-message", error.message, true); }
  });
  async function changeStatus(action, text) {
    try { await api("/api/admin/v1/assets/" + currentId + "/" + action, { method: "POST", body: "{}" }); await open(currentId); await list(); msg("media-detail-message", text); }
    catch (error) { msg("media-detail-message", error.message, true); }
  }
  $("media-activate").addEventListener("click", function () { changeStatus("activate", "图片已获准公开。"); });
  $("media-disable").addEventListener("click", function () { changeStatus("disable", "图片已停用，公开地址立即不可用。"); });
  $("media-refresh").addEventListener("click", list);
  $("media-close").addEventListener("click", function () { $("media-editor").hidden = true; currentId = null; });
  window.mediaAdmin = { show: list };
})();
