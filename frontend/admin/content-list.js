(function () {
  "use strict";
  const labels = { all: "全部", draft: "草稿待核", ready: "待发布", published: "已发布", changes: "有新草稿" };
  window.ScaleContentList = {
    create({ cardId, listId, searchId, endpoint, open, news = false }) {
      const card = document.getElementById(cardId), list = document.getElementById(listId), search = document.getElementById(searchId);
      let page = 1, state = "all", sequence = 0, previousKey = "";
      const tools = document.createElement("div"); tools.className = "content-list-controls";
      const tabs = document.createElement("div"); tabs.className = "content-state-tabs"; tabs.setAttribute("aria-label", "中文内容状态分区");
      const buttons = {};
      for (const key of Object.keys(labels)) {
        const button = document.createElement("button"); button.type = "button";
        button.onclick = () => { state = key; page = 1; load(); }; buttons[key] = button; tabs.append(button);
      }
      const scopeLabel = document.createElement("label"); scopeLabel.textContent = "内容范围 ";
      const scope = document.createElement("select"); scope.setAttribute("aria-label", "内容范围");
      scope.append(new Option("业务内容", "business"), new Option("测试内容", "test"), new Option("全部内容", "all")); scopeLabel.append(scope);
      const sortLabel = document.createElement("label"); sortLabel.textContent = "排序 ";
      const sort = document.createElement("select"); sort.setAttribute("aria-label", "内容排序");
      sort.add(new Option("最近编辑", "updated")); if (news) sort.add(new Option("新闻日期从新到旧", "date")); sortLabel.append(sort);
      const category = document.createElement("select"); category.setAttribute("aria-label","发布位置筛选");
      category.append(new Option("全部类型","all"),new Option("新闻动态","news"),new Option("实验室活动","activity"));
      if(news){const label=document.createElement("label");label.textContent="发布位置 "; label.append(category); tools.append(label);}
      const note = document.createElement("p"); note.className = "field-help"; note.textContent = "按中文最新修订分区；“有新草稿”表示旧版仍公开。测试分区识别约定的测试标识，不删除任何内容。";
      tools.append(tabs, scopeLabel, sortLabel, note); list.before(tools);
      const pages = document.createElement("div"); pages.className = "news-pagination";
      const prev = document.createElement("button"), next = document.createElement("button"), count = document.createElement("span");
      prev.type = next.type = "button"; prev.textContent = "上一页"; next.textContent = "下一页"; count.setAttribute("role", "status");
      pages.append(prev, count, next); list.after(pages);
      async function load() {
        const url = endpoint(), key = [url, search.value, scope.value, sort.value, category.value].join("|");
        if (key !== previousKey) { page = 1; previousKey = key; }
        const request = ++sequence;
        prev.disabled = next.disabled = true; count.textContent = "正在加载…";
        list.textContent = "正在加载内容…";
        try {
          const result = await window.scaleAdmin.api(url + "?" + new URLSearchParams({ category: news ? category.value : "all", q: search.value, scope: scope.value, state, sort: sort.value, page, pageSize: 10 }), {}, true);
          if (request !== sequence) return;
          const totalPages = Math.max(1, Math.ceil(result.meta.total / 10));
          if (page > totalPages) { page = totalPages; return load(); }
          for (const [key, button] of Object.entries(buttons)) {
            const n = key === "all" ? Object.values(result.meta.counts).reduce((a, b) => a + b, 0) : result.meta.counts[key] || 0;
            button.textContent = labels[key] + " · " + n; button.setAttribute("aria-pressed", String(state === key));
          }
          list.replaceChildren();
          for (const row of result.data) {
            const item = document.createElement("div"); item.className = "list-row";
            const body = document.createElement("div"), title = document.createElement("strong"), info = document.createElement("small"), status = document.createElement("span");
            title.textContent = (news ? (row.category === "activity" ? "[活动] " : "[新闻] ") : "") + (row.title || row.nameZh || row.slug);
            info.textContent = row.slug + " · v" + row.version + (row.happened_at ? " · 内容日期 " + row.happened_at : "") + (row.activityDate ? " · " + row.activityDate : "") + (row.isTest ? " · 测试内容" : "");
            status.className = "status"; status.textContent = labels[row.workflow_state]; body.append(title, info); item.append(body, status);
            if (news && row.published_zh) { const link = document.createElement("a"); link.href = "/news.html?slug=" + encodeURIComponent(row.slug) + "&lang=zh"; link.textContent = "查看公开页"; link.target = "_blank"; link.rel = "noopener"; item.append(link); }
            const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "编辑"; edit.onclick = () => open(row.id); item.append(edit); list.append(item);
          }
          if (!result.data.length) list.textContent = "此分区暂无符合条件的内容。";
          count.textContent = "共 " + result.meta.total + " 条 · 第 " + page + " / " + totalPages + " 页 · 每页10条";
          prev.disabled = page <= 1; next.disabled = page >= totalPages;
        } catch (error) { if (request === sequence) { count.textContent = "加载失败"; list.textContent = error.message; } }
      }
      category.onchange = scope.onchange = sort.onchange = () => { page = 1; load(); };
      prev.onclick = () => { page--; load(); }; next.onclick = () => { page++; load(); };
      return { load, reset() { state = "all"; page = 1; previousKey = ""; }, invalidate() { ++sequence; } };
    }
  };
})();
