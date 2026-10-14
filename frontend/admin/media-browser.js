(function () {
  "use strict";
  const api=(...args)=>window.scaleAdmin.api(...args);
  const statusNames={pending:"待核",active:"已启用",disabled:"已停用"};
  function folders(libraries) {
    const result=[];
    libraries.forEach(lib=>{
      const visit=(parent,path,depth)=>{
        if(depth>100) return;
        lib.folders.filter(f=>f.parentId===parent).forEach(f=>{
          const label=path+" / "+f.name;
          result.push({...f,libraryId:lib.id,label,depth});
          visit(f.id,label,depth+1);
        });
      };
      visit(null,lib.name,0);
    });
    return result;
  }
  function folderOptions(select,libraries,value,empty="未分类（默认图片库）") {
    select.replaceChildren(new Option(empty,""));
    folders(libraries).forEach(f=>select.add(new Option(f.label,f.id)));
    select.value=value || "";
  }
  function create(root,onSelect,{picker=false}={}) {
    let page=1,seq=0,disposed=false,libraries=[];
    root.innerHTML='<div class="media-browser-tools"><label>媒体库<select data-library><option value="">全部媒体库</option></select></label><label>文件夹<select data-folder><option value="">全部文件夹</option></select></label><label>搜索<input data-search type="search" maxlength="200" placeholder="图片名称或替代文本"></label><label>状态<select data-status><option value="">全部状态</option><option value="active">已启用</option><option value="pending">待核</option><option value="disabled">已停用</option></select></label><label class="media-check"><input data-extra type="checkbox"> '+(picker?"包含待核图片":"查看归档")+'</label></div><p data-message role="status"></p><div data-grid class="media-grid"></div><div class="media-pages"><button data-prev type="button">上一页</button><span data-page></span><button data-next type="button">下一页</button></div>';
    const get=s=>root.querySelector(s), lib=get("[data-library]"), folder=get("[data-folder]");
    async function load() {
      const request=++seq;
      const params=new URLSearchParams({page,pageSize:24,q:get("[data-search]").value,status:get("[data-status]").value,libraryId:lib.value,folderId:folder.value});
      if(picker) params.set("usable",String(!get("[data-extra]").checked));
      else params.set("archived",String(get("[data-extra]").checked));
      get("[data-message]").textContent="正在加载图片…";
      try {
        const result=await api("/api/admin/v1/assets?"+params,{},true);
        if(disposed || request!==seq) return;
        const grid=get("[data-grid]"); grid.replaceChildren();
        result.data.forEach(asset=>{
          const tile=document.createElement("button"); tile.type="button";tile.className="media-tile";
          const img=document.createElement("img");img.src="/api/admin/v1/assets/"+asset.id+"/file";img.alt="";img.loading="lazy";
          const label=document.createElement("span");label.textContent=asset.displayName || asset.altZh || "未命名图片";
          const info=document.createElement("small");info.textContent=statusNames[asset.status]+(asset.copyright && asset.people ? " · 授权完整" : " · 授权待核")+" · "+asset.width+" × "+asset.height;
          tile.append(img,label,info);tile.addEventListener("click",()=>onSelect(asset));grid.append(tile);
        });
        get("[data-message]").textContent=result.data.length ? "点击图片"+(picker?"选择使用":"查看资料与引用") : "此位置没有符合条件的图片。";
        get("[data-page]").textContent="第 "+page+" 页 / 共 "+Math.max(1,Math.ceil(result.meta.total/24))+" 页 · "+result.meta.total+" 张";
        get("[data-prev]").disabled=page<=1;
        get("[data-next]").disabled=page*24>=result.meta.total;
      } catch(error) {if(!disposed && request===seq) get("[data-message]").textContent=error.message;}
    }
    function folderFilter() {folderOptions(folder,lib.value ? libraries.filter(l=>l.id===lib.value) : libraries,"","全部文件夹");}
    async function refresh() {
      libraries=await api("/api/admin/v1/assets/libraries");
      if(disposed) return;
      const selected=lib.value,selectedFolder=folder.value;
      lib.replaceChildren(new Option("全部媒体库",""));
      libraries.forEach(l=>lib.add(new Option(l.name,l.id)));
      lib.value=selected;folderFilter();folder.value=selectedFolder;
      await load();
    }
    lib.addEventListener("change",()=>{folderFilter();page=1;load();});
    [folder,get("[data-status]"),get("[data-extra]")].forEach(n=>n.addEventListener("change",()=>{page=1;load();}));
    let timer;
    get("[data-search]").addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>{page=1;load();},250);});
    get("[data-prev]").onclick=()=>{page--;load();};
    get("[data-next]").onclick=()=>{page++;load();};
    return {refresh,load,get libraries(){return libraries;},get libraryId(){return lib.value;},get folderId(){return folder.value;},destroy(){disposed=true;seq++;clearTimeout(timer);}};
  }
  function pick() {
    return new Promise(resolve=>{
      const previous=document.activeElement, dialog=document.createElement("dialog");dialog.className="media-picker";
      dialog.innerHTML='<header><h2>从媒体库选择图片</h2><button type="button" data-close>取消</button></header><p>图片可在不同内容中复用。待核图片可用于草稿，发布前须完成授权。</p><div data-browser></div><details><summary>上传新图片到媒体库</summary><form data-upload class="fields"><label>图片文件<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required></label><label>图片名称<input name="displayName" maxlength="200"></label><label>保存位置<select name="folderId"></select></label><label>中文替代文本<input name="altZh" required maxlength="500"></label><label>摄影／图片署名<input name="credit" required maxlength="300"></label><label>图片来源说明<textarea name="sourceNote" required maxlength="2000"></textarea></label><label>公开使用依据<textarea name="evidenceNote" maxlength="2000"></textarea></label><label class="media-check"><input name="copyright" type="checkbox"> 已核对版权使用许可</label><label class="media-check"><input name="people" type="checkbox"> 已核对人物公开许可（无人物也须核对）</label><button type="submit">上传到媒体库</button></form><p data-upload-message role="status"></p></details>';
      document.body.append(dialog);
      let selected=null;
      const browser=create(dialog.querySelector("[data-browser]"),asset=>{selected=asset;dialog.close();},{picker:true});
      dialog.querySelector("[data-close]").onclick=()=>dialog.close();
      dialog.addEventListener("close",()=>{browser.destroy();dialog.remove();previous?.focus();resolve(selected);},{once:true});
      const form=dialog.querySelector("[data-upload]"),message=dialog.querySelector("[data-upload-message]");
      form.addEventListener("submit",async event=>{
        event.preventDefault();const button=form.querySelector("button");button.disabled=true;
        try {
          const values=new FormData(form),evidence=String(values.get("evidenceNote") || "").trim();
          if((values.has("copyright") || values.has("people")) && !evidence) throw new Error("请填写公开使用依据");
          const data=new FormData();
          ["file","displayName","folderId","altZh","credit","sourceNote"].forEach(k=>data.append(k,values.get(k)));
          const uploaded=await api("/api/admin/v1/assets",{method:"POST",body:data});
          // Keep the upload's ID if a later authorization step fails: never re-upload silently.
          message.textContent="已上传到媒体库："+uploaded.id;
          form.reset();
          for(const type of ["copyright","people"]) if(values.has(type)) await api("/api/admin/v1/assets/"+uploaded.id+"/clearances",{method:"POST",body:JSON.stringify({type,allowed:true,evidenceNote:evidence})});
          if(values.has("copyright") && values.has("people")) await api("/api/admin/v1/assets/"+uploaded.id+"/activate",{method:"POST",body:"{}"});
          else dialog.querySelector("[data-extra]").checked=true;
          await browser.refresh();
          message.textContent="已上传。请在图片列表中选择；未完成授权的图片不能发布。";
        } catch(error) {message.textContent+=" "+error.message;}
        finally {button.disabled=false;}
      });
      dialog.showModal();
      browser.refresh().then(()=>folderOptions(form.elements.folderId,browser.libraries,"")).catch(e=>{message.textContent=e.message;});
    });
  }
  window.ScaleMedia={create,pick,folders,folderOptions};
})();
