(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let items = [], page = 1, sequence = 0;
  const en = () => document.documentElement.lang === "en";
  function render() {
    const query = $("public-news-search").value.trim().toLocaleLowerCase();
    const year = $("public-news-year").value;
    const filtered = items.filter(n => (!year || n.happenedAt?.startsWith(year)) &&
      (!query || (n.title + " " + n.summary).toLocaleLowerCase().includes(query)));
    const pages = Math.max(1, Math.ceil(filtered.length / 10)); page = Math.min(page, pages);
    $("all-news").replaceChildren();
    for (const n of filtered.slice((page - 1) * 10, page * 10)) {
      const row = document.createElement("article"); row.className = "news-item";
      const date = document.createElement("time"); date.className = "date"; date.dateTime = n.happenedAt; date.textContent = n.happenedAt;
      const body = document.createElement("div"), title = document.createElement("h2"), link = document.createElement("a");
      link.className = "news-title-link"; link.href = "news.html?slug=" + encodeURIComponent(n.slug) + "&lang=" + (en() ? "en" : "zh"); link.textContent = n.title;
      title.append(link); const summary = document.createElement("p"); summary.textContent = n.summary;
      const read = document.createElement("a"); read.className = "text-link"; read.href = link.href; read.textContent = en() ? "Read story ↗" : "阅读全文 ↗";
      body.append(title, summary, read); row.append(date, body); $("all-news").append(row);
    }
    $("public-news-count").textContent = en() ? filtered.length + " stories" : "共 " + filtered.length + " 条新闻";
    if (!filtered.length) $("all-news").textContent = en() ? "No matching published news." : "暂无符合条件的已发布新闻。";
    $("public-news-page").textContent = page + " / " + pages;
    $("public-news-prev").disabled = page <= 1; $("public-news-next").disabled = page >= pages;
  }
  async function load() {
    const request = ++sequence, locale = en() ? "en" : "zh";
    $("all-news").textContent = en() ? "Loading…" : "正在加载新闻…";
    $("public-news-count").textContent = "";
    $("public-news-prev").disabled = $("public-news-next").disabled = true;
    try {
      const response = await fetch("/api/v1/news?locale=" + locale);
      if (!response.ok) throw new Error();
      const result = await response.json(); if (request !== sequence) return;
      items = result.data; page = 1;
      $("public-news-year").replaceChildren(new Option(en() ? "All years" : "全部年份", ""));
      [...new Set(items.map(n => n.happenedAt?.slice(0, 4)).filter(Boolean))].sort().reverse().forEach(year => $("public-news-year").add(new Option(year, year)));
      render();
    } catch (_) { if (request === sequence) $("all-news").textContent = en() ? "News is temporarily unavailable. Please reload." : "新闻暂时无法加载，请刷新重试。"; }
  }
  $("public-news-filters").onsubmit = e => e.preventDefault();
  $("public-news-search").oninput = $("public-news-year").onchange = () => { page = 1; render(); };
  $("public-news-prev").onclick = () => { page--; render(); };
  $("public-news-next").onclick = () => { page++; render(); };
  document.addEventListener("scale-lab-language-change", load); load();
})();
