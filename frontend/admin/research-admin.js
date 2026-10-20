(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var api = window.scaleAdmin.api, esc = window.scaleAdmin.escapeHtml;
  var form = $("research-form"), module = "", currentId = null, version = null, checked = false, published = false, dirty = false, activeLocale = "zh";
  var configs = {
    directions: { path: "research-directions", title: "研究方向", fields: '<label>方向编号<input name="themeNumber" type="number" min="1" max="3" required></label><label>参与成员 <small>仅填已确认可公开的人名</small><input name="participants" maxlength="500"></label><label class="wide">子主题 <small>每行：子主题｜条目1；条目2</small><textarea name="areasText" rows="6" placeholder="学生建模｜认知诊断；知识追踪"></textarea></label>' },
    publications: { path: "publications", title: "论文成果", fields: '<label>年份<input name="year" type="number" min="1900" max="2100" required></label><label>发表阶段<select name="stage"><option value="published">已发表</option><option value="accepted">已接收</option><option value="in_press">出版中</option><option value="preprint">预印本</option></select></label><label class="wide">作者 <small>保留原顺序</small><input name="authors" required maxlength="2000"></label><label class="wide">期刊／会议<input name="venue" required maxlength="500"></label><label>DOI<input name="doi" placeholder="10.xxxx/..."></label><label>展示标签<input name="badge" maxlength="100"></label><label class="wide">论文外链<input name="externalUrl" type="url" placeholder="https://..."></label>' },
    projects: { path: "projects", title: "科研项目", fields: '<label>项目编号<input name="grantCode" maxlength="100"></label><label>项目状态<select name="projectStatus"><option value="planned">计划中</option><option value="ongoing">在研</option><option value="completed">已结题</option></select></label><label>资助类别<input name="fundingType" required maxlength="300"></label><label>承担角色<input name="role" required maxlength="200" placeholder="主持 / 参与"></label><label>开始日期<input name="startsOn" type="date"></label><label>结束日期<input name="endsOn" type="date"></label>' }
  };
  function endpoint(suffix) { return "/api/admin/v1/" + configs[module].path + (suffix || ""); }
  function msg(value, error) { $("research-message").textContent = value; $("research-message").classList.toggle("error", !!error); }
  function buttons() {
    $("research-check").disabled = !currentId || checked || dirty;
    $("research-preview").disabled = !currentId || dirty;
    $("research-publish").disabled = !currentId || !checked || dirty;
    $("research-withdraw").disabled = !currentId || !published || dirty;
  }
  function reset() {
    form.reset(); currentId = null; version = null; checked = false; published = false; dirty = false; activeLocale = "zh";
    form.elements.slug.disabled = false;
    if (module === "publications") form.elements.year.value = new Date().getFullYear();
    $("research-editor-title").textContent = "新建" + configs[module].title;
    $("research-preview-box").hidden = true; $("research-history").textContent = ""; msg(""); buttons();
    $("research-list-card").hidden = true; $("research-editor-card").hidden = false;
  }
  var contentList = window.ScaleContentList.create({ cardId: "research-list-card", listId: "research-list", searchId: "research-search", endpoint: function() { return endpoint(); }, open: open });
  function list() { return contentList.load(); }

  function areaLines(areas) { return (areas || []).map(function (area) { return area.title + "｜" + area.items.join("；"); }).join("\n"); }
  function parseAreas(value) {
    return value.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean).map(function (line) {
      var separator = line.indexOf("｜");
      if (separator < 1) throw new Error("子主题格式应为：标题｜条目1；条目2");
      var title = line.slice(0, separator).trim();
      var items = line.slice(separator + 1).split(/[；;]/).map(function (item) { return item.trim(); }).filter(Boolean);
      if (!title || !items.length) throw new Error("每个子主题须有标题和至少一个条目");
      return { title: title, items: items };
    });
  }
  async function open(id, locale) {
    try {
      var row = await api(endpoint("/" + id + "?locale=" + (locale || "zh"))); reset(); currentId = row.id; version = row.version; checked = row.reviewState === "ready"; published = row.published; activeLocale = row.locale;
      ["slug", "locale", "title", "summary", "body", "sourceUrl", "sourceNote"].forEach(function (name) { form.elements[name].value = row[name] || ""; });
      var keys = module === "directions" ? ["themeNumber", "participants"] : module === "publications" ? ["year", "authors", "venue", "stage", "doi", "externalUrl", "badge"] : ["grantCode", "fundingType", "role", "projectStatus", "startsOn", "endsOn"];
      keys.forEach(function (name) { form.elements[name].value = row[name] == null ? "" : row[name]; });
      if (module === "directions") form.elements.areasText.value = areaLines(row.areas);
      form.elements.slug.disabled = true; dirty = false;
      $("research-editor-title").textContent = "编辑" + configs[module].title + " · " + (row.locale === "en" ? "English" : "中文") + " · v" + version; buttons(); history();
    } catch (error) { msg(error.message, true); }
  }
  async function history() {
    try { var rows = await api(endpoint("/" + currentId + "/revisions")); $("research-history").innerHTML = '<strong>修订历史</strong><br>' + rows.map(function (row) { return '<span>v' + row.version + ' · ' + (row.locale === "en" ? "EN" : "中") + ' · ' + esc(row.title) + (row.published ? ' · 已公开' : '') + '</span>'; }).join(""); }
    catch (error) { $("research-history").textContent = error.message; }
  }
  function payload() {
    var data = Object.fromEntries(new FormData(form).entries()); data.expectedVersion = version;
    if (module === "directions") { data.areas = parseAreas(data.areasText || ""); delete data.areasText; data.themeNumber = Number(data.themeNumber); }
    if (module === "publications") data.year = Number(data.year);
    return data;
  }
  async function action(suffix, success) {
    if (!currentId) return;
    try { await api(endpoint("/" + currentId + suffix), { method: "POST", body: JSON.stringify({ expectedVersion: version, locale: activeLocale }) }); await open(currentId, activeLocale); msg(success); list(); }
    catch (error) { msg(error.message, true); }
  }
  $("research-new").addEventListener("click", reset);
  $("research-close").addEventListener("click", function () { $("research-editor-card").hidden = true; $("research-list-card").hidden = false; list(); });
  $("research-search").addEventListener("input", function () { clearTimeout(window.researchSearchTimer); window.researchSearchTimer = setTimeout(list, 250); });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    try { var data = payload(); var result = await api(endpoint(currentId ? "/" + currentId + "/draft" : ""), { method: currentId ? "PUT" : "POST", body: JSON.stringify(data) }); await open(result.id, data.locale); msg("草稿已保存。核查来源后才可发布。"); list(); }
    catch (error) { msg(error.message, true); }
  });
  form.addEventListener("input", function (event) { if (event.target.name === "locale") return; dirty = true; buttons(); msg("表单有未保存改动，请先保存草稿。"); });
  form.elements.locale.addEventListener("change", function () {
    var next = form.elements.locale.value;
    if (!currentId || dirty) { form.elements.locale.value = activeLocale; msg(currentId ? "请先保存当前语言的改动。" : "请先创建中文内容，再编辑英文。", true); return; }
    open(currentId, next);
  });
  $("research-check").addEventListener("click", function () { action("/check", "当前修订已核查。"); });
  $("research-publish").addEventListener("click", function () { action("/publish", "已发布到公开网站。"); });
  $("research-withdraw").addEventListener("click", function () { action("/withdraw", "已撤回公开内容。"); });
  $("research-preview").addEventListener("click", async function () {
    try { var row = await api(endpoint("/" + currentId + "/preview?locale=" + activeLocale)); var detail = module === "directions" ? areaLines(row.areas) : module === "publications" ? [row.year, row.authors, row.venue, row.stage, row.doi].filter(Boolean).join(" · ") : [row.fundingType, row.grantCode, row.projectStatus, row.startsOn, row.endsOn].filter(Boolean).join(" · "); $("research-preview-box").innerHTML = '<h3>' + esc(row.title) + '</h3><p>' + esc(row.summary) + '</p><p>' + esc(detail) + '</p><div>' + esc(row.body) + '</div>'; $("research-preview-box").hidden = false; }
    catch (error) { msg(error.message, true); }
  });
  window.researchAdmin = { show: function (name) {
    module = name; $("research-heading").textContent = configs[module].title;
    $("research-special-fields").innerHTML = configs[module].fields;
    form.elements.summary.required = module !== "directions";
    form.elements.summary.closest("label").querySelector(".research-summary-help")?.remove();
    if (module === "directions") form.elements.summary.insertAdjacentHTML("beforebegin", "<small class=\"field-guide-note research-summary-help\">仅核准名称时留空；简介核准后再补充。</small>");
    window.refreshFieldGuide?.();
    $("research-editor-card").hidden = true; $("research-list-card").hidden = false;
    $("research-search").value = ""; contentList.reset(); list();
  } };
})();
