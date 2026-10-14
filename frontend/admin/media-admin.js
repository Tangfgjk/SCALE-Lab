(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var api = window.scaleAdmin.api, esc = window.scaleAdmin.escapeHtml;
  var currentId = null, current = null;
  var labels = { copyright: "版权／使用许可", people: "人物公开情况" };
  var browser = window.ScaleMedia.create($("media-browser"),function(asset){open(asset.id);});
  function msg(id, text, error) { var node = $(id); node.textContent = text; node.classList.toggle("error", !!error); }
  async function list() {
    try {
      await browser.refresh();
      ["media-upload-form","media-meta-form"].forEach(function(id){
        var select=$(id).elements.folderId;
        window.ScaleMedia.folderOptions(select,browser.libraries,select.value);
      });
    } catch (error) { msg("media-upload-message", error.message, true); }
  }
  async function open(id) {
    try {
      current = await api("/api/admin/v1/assets/" + id); currentId = id;
      $("media-editor").hidden = false; $("media-preview").src = "/api/admin/v1/assets/" + encodeURIComponent(id) + "/file";
      $("media-preview").alt = current.altZh || "待核图片";
      ["displayName","folderId","altZh", "altEn", "credit", "sourceNote"].forEach(function (name) { $("media-meta-form").elements[name].value = current[name] || ""; });
      $("media-archive").textContent=current.archived ? "恢复归档" : "归档图片";
      $("media-activate").disabled=current.archived;
      $("media-status").textContent = "状态：" + ({ pending: "待核", active: "已启用", disabled: "已停用" }[current.status] || current.status) + " · " + current.width + " × " + current.height;
      renderClearances();
      var usages = await api("/api/admin/v1/assets/" + id + "/usages");
      $("media-usages").textContent = usages.length ? "引用记录：" + usages.map(function (item) { return item.type+" · "+item.slug + " v" + item.version + (item.publishedLocale ? " · 已发布 " + item.publishedLocale : " · 草稿或历史修订"); }).join("；") : "暂无引用";
      $("media-editor").scrollIntoView({behavior:"smooth",block:"start"});
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
  $("media-archive").onclick=async function(){
    if(!current || !confirm(current.archived ? "恢复后将处于待核状态，确认恢复？" : "归档后所有引用位置将停止公开显示此图片，确认归档？")) return;
    try {
      await api("/api/admin/v1/assets/"+currentId+"/archive",{method:"POST",body:JSON.stringify({archived:!current.archived})});
      await open(currentId);await list();
    } catch(error){msg("media-detail-message",error.message,true);}
  };
  function folderDialog(editing) {
    var selected=window.ScaleMedia.folders(browser.libraries).find(function(f){return f.id===browser.folderId;});
    if(editing && !selected){msg("media-library-message","请先在文件夹筛选中选择要整理的文件夹。",true);return;}
    var dialog=document.createElement("dialog");dialog.className="media-picker";
    dialog.innerHTML='<h2>'+(editing?"整理文件夹":"新建文件夹")+'</h2><form class="fields"><label>名称<input name="name" maxlength="100" required></label><label>媒体库<select name="libraryId" required></select></label><label>父文件夹<select name="parentId"></select></label><div><button type="submit">保存</button> <button type="button" data-cancel>取消</button></div></form><p role="status"></p>';
    var form=dialog.querySelector("form"),lib=form.elements.libraryId;
    browser.libraries.forEach(function(l){lib.add(new Option(l.name,l.id));});
    lib.value=selected?.libraryId || browser.libraryId || browser.libraries[0]?.id || "";
    lib.disabled=editing;
    function parents() {window.ScaleMedia.folderOptions(form.elements.parentId,browser.libraries.filter(function(l){return l.id===lib.value;}),editing ? selected.parentId : selected?.id,"媒体库根目录");}
    lib.onchange=parents;parents();form.elements.name.value=editing ? selected.name : "";
    dialog.querySelector("[data-cancel]").onclick=function(){dialog.close();};
    dialog.onclose=function(){dialog.remove();};
    form.onsubmit=async function(event){
      event.preventDefault();
      try{
        await api("/api/admin/v1/assets/folders"+(editing ? "/"+selected.id : ""),{method:editing ? "PATCH" : "POST",body:JSON.stringify({name:form.elements.name.value,libraryId:lib.value,parentId:form.elements.parentId.value || null})});
        await list();dialog.close();msg("media-library-message","文件夹已保存。已有图片引用保持有效。");
      }catch(error){dialog.querySelector("p").textContent=error.message;}
    };
    document.body.append(dialog);dialog.showModal();
  }
  $("media-new-library").onclick=async function(){
    var name=prompt("新媒体库名称（例如：学术活动）");if(!name) return;
    try{await api("/api/admin/v1/assets/libraries",{method:"POST",body:JSON.stringify({name:name})});await list();msg("media-library-message","媒体库已创建，内含未分类文件夹。");}
    catch(error){msg("media-library-message",error.message,true);}
  };
  $("media-new-folder").onclick=function(){folderDialog(false);};
  $("media-edit-folder").onclick=function(){folderDialog(true);};
  window.mediaAdmin = { show: list };
})();
