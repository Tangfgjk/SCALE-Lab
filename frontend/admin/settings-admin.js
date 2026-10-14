(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var api = window.scaleAdmin.api, esc = window.scaleAdmin.escapeHtml;
  var form = $("settings-form"), version = 0, current = null, activeLocale = "zh", dirty = false;
  function message(text, error) { var node = $("settings-message"); node.textContent = text; node.classList.toggle("error", !!error); }
  function fields() { return form.elements; }
  function setButtons() {
    var saved = !!current?.revisionId && !dirty;
    $("settings-check").disabled = !saved;
    $("settings-preview").disabled = !saved;
    $("settings-publish").disabled = !saved || current.reviewState !== "ready";
    $("settings-withdraw").disabled = !current?.published;
    $("settings-status").textContent = (current?.currentPublished ? "当前修订已发布" : current?.published ? "旧修订仍公开" : "未发布") + " · " + (current?.reviewState === "ready" ? "已核查" : "待核查") + " · 全局版本 " + version;
  }
  function comma(values) { return (values || []).join(", "); }
  function parseComma(value) { return value.split(",").map(function (item) { return item.trim(); }).filter(Boolean); }
  function fill(row) {
    current = row; version = row.globalVersion; activeLocale = row.locale; dirty = false;
    ["name", "shortName", "intro", "tagline", "heroTitleBefore", "heroHighlight", "heroTitleAfter", "cultureTitle", "cultureVision", "department", "university", "location", "contactEmail", "sourceUrl", "sourceNote"].forEach(function (key) { fields()[key].value = row[key] || ""; });
    fields().locale.value = row.locale;
    fields().logoAssetId.value = row.logoAssetId || "";
    ["newsSlugs", "directionSlugs", "publicationSlugs"].forEach(function (key) { fields()[key].value = comma(row.featured?.[key]); });
    fields().statsText.value = (row.stats || []).map(function (item) { return [item.value, item.unit, item.label, item.sourceNote].join(" | "); }).join("\n");
    fields().cultureValuesText.value = (row.cultureValues || []).map(function (item) { return item.title + " | " + item.text; }).join("\n");
    $("settings-preview-box").hidden = true;
    setButtons();
  }
  async function load(locale) {
    try {
      var row = await api("/api/admin/v1/settings?locale=" + locale);
      fill(row); message(row.revisionId ? "当前语言草稿已加载。" : "该语言尚无草稿，请填写资料并保存。");
      var revisions = await api("/api/admin/v1/settings/revisions");
      $("settings-history").innerHTML = revisions.length ? "<strong>修订历史</strong><br>" + revisions.map(function (item) {
        return "<span>v" + item.version + " · " + esc(item.locale) + " · " + esc(item.name) + (item.published ? " · 已公开" : "") + "</span>";
      }).join("") : "暂无修订";
    } catch (error) { message(error.message, true); }
  }
  async function loadLogoOptions() {
    try {
      var rows = await api("/api/admin/v1/assets");
      var selected = fields().logoAssetId.value;
      $("settings-logo").innerHTML = '<option value="">沿用当前文字标识</option>' + rows.filter(function (row) { return row.status === "active"; }).map(function (row) {
        return '<option value="' + esc(row.id) + '">' + esc(row.altZh || row.id) + '</option>';
      }).join("");
      fields().logoAssetId.value = selected;
    } catch (error) { message("Logo 列表加载失败：" + error.message, true); }
  }
  function payload() {
    var values = Object.fromEntries(new FormData(form).entries());
    var lines = values.statsText.trim() ? values.statsText.trim().split(/\r?\n/) : [];
    var stats = lines.map(function (line) {
      var parts = line.split("|").map(function (part) { return part.trim(); });
      if (parts.length !== 4 || parts.some(function (part, index) { return index !== 1 && !part; })) throw new Error("统计指标每行须填写：数值 | 单位 | 名称 | 核验来源");
      return { value: parts[0], unit: parts[1], label: parts[2], sourceNote: parts[3] };
    });
    var cultureValues = values.cultureValuesText.trim() ? values.cultureValuesText.trim().split(/\r?\n/).map(function (line) {
      var bar = line.indexOf("|");
      if (bar < 0 || !line.slice(0, bar).trim() || !line.slice(bar + 1).trim()) throw new Error("文化价值观每行须填写：标题 | 说明");
      return { title: line.slice(0, bar).trim(), text: line.slice(bar + 1).trim() };
    }) : [];
    return { expectedVersion: version, locale: values.locale, name: values.name, shortName: values.shortName, intro: values.intro,
      tagline: values.tagline, department: values.department, university: values.university, location: values.location,
      heroTitleBefore: values.heroTitleBefore, heroHighlight: values.heroHighlight, heroTitleAfter: values.heroTitleAfter,
      cultureTitle: values.cultureTitle, cultureVision: values.cultureVision, cultureValues: cultureValues,
      contactEmail: values.contactEmail, logoAssetId: values.logoAssetId || null,
      featured: { newsSlugs: parseComma(values.newsSlugs), directionSlugs: parseComma(values.directionSlugs), publicationSlugs: parseComma(values.publicationSlugs) },
      stats: stats, sourceUrl: values.sourceUrl, sourceNote: values.sourceNote };
  }
  async function operate(action, success) {
    try {
      await api("/api/admin/v1/settings/" + action, { method: "POST", body: JSON.stringify({ locale: activeLocale, expectedVersion: version }) });
      await load(activeLocale); message(success);
    } catch (error) { message(error.message, true); }
  }
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    try { var values = payload(); await api("/api/admin/v1/settings/draft", { method: "PUT", body: JSON.stringify(values) }); await load(activeLocale); message("草稿已保存，核查后可发布。"); }
    catch (error) { message(error.message, true); }
  });
  form.addEventListener("input", function (event) { if (event.target.name === "locale") return; dirty = true; setButtons(); message("表单有未保存的修改。"); });
  fields().locale.addEventListener("change", function () {
    var next = fields().locale.value;
    if (dirty) { fields().locale.value = activeLocale; message("请先保存当前语言的改动。", true); return; }
    load(next).then(loadLogoOptions);
  });
  $("settings-check").addEventListener("click", function () { operate("check", "当前修订已核查，可以发布。"); });
  $("settings-publish").addEventListener("click", function () { operate("publish", "站点设置已发布。"); });
  $("settings-withdraw").addEventListener("click", function () { operate("withdraw", "站点设置已撤回。"); });
  $("settings-preview").addEventListener("click", async function () {
    try { var row = await api("/api/admin/v1/settings/preview?locale=" + activeLocale);
      $("settings-preview-box").innerHTML = "<h3>" + esc(row.name) + "</h3><p>" + esc(row.intro) + "</p><p>首页标题：" + esc((row.heroTitleBefore || "") + (row.heroHighlight || "") + (row.heroTitleAfter || "")) + "</p>" +
        "<p>文化页：" + esc(row.cultureTitle || "") + " · " + esc(row.cultureVision || "") + "</p>" +
        "<ul>" + (row.cultureValues || []).map(function (item) { return "<li><strong>" + esc(item.title) + "</strong>：" + esc(item.text) + "</li>"; }).join("") + "</ul>" +
        "<small>" + esc(row.department) + " · " + esc(row.university) + " · " + esc(row.location) + "</small>";
      $("settings-preview-box").hidden = false;
    } catch (error) { message(error.message, true); }
  });
  window.settingsAdmin = { show: function () { load(activeLocale).then(loadLogoOptions); } };
})();
