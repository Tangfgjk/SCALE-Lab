(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let items = [], page = 1, sequence = 0, meta = {}, timer;
  const en = () => document.documentElement.lang === "en";
  function render() {
    const filtered = items;
    const pages = Math.max(1, meta.pages || 1);
    $("all-news").replaceChildren();
    for (const n of filtered) {
      const row = document.createElement("article"); row.className = "news-item";
      const date = document.createElement("time"); date.className = "date"; date.dateTime = n.happenedAt; date.textContent = n.happenedAt;
      const body = document.createElement("div"), title = document.createElement("h2"), link = document.createElement("a");
      link.className = "news-title-link"; link.href = "news.html?slug=" + encodeURIComponent(n.slug) + "&lang=" + (en() ? "en" : "zh"); link.textContent = n.title;
      title.append(link); const summary = document.createElement("p"); summary.textContent = n.summary;
      const read = document.createElement("a"); read.className = "text-link"; read.href = link.href; read.textContent = en() ? "Read story ↗" : "阅读全文 ↗";
      body.append(title, summary, read); row.append(date, body); $("all-news").append(row);
    }
    $("public-news-count").textContent = en() ? meta.total + " stories" : "共 " + meta.total + " 条新闻";
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
      const response = await fetch("/api/v1/news?" + new URLSearchParams({locale, page, pageSize:10, q:$("public-news-search").value.trim(), year:$("public-news-year").value}));
      if (!response.ok) throw new Error();
      const result = await response.json(); if (request !== sequence) return;
      items = result.data; meta = result.meta;
      const selectedYear = $("public-news-year").value;
      $("public-news-year").replaceChildren(new Option(en() ? "All years" : "全部年份", ""));
      (meta.years || []).forEach(year => $("public-news-year").add(new Option(year, year)));
      $("public-news-year").value = selectedYear;
      render();
    } catch (_) { if (request === sequence) $("all-news").textContent = en() ? "News is temporarily unavailable. Please reload." : "新闻暂时无法加载，请刷新重试。"; }
  }
  $("public-news-filters").onsubmit = e => e.preventDefault();
  $("public-news-search").oninput = () => { page = 1; sequence++; clearTimeout(timer); timer=setTimeout(load,250); };
  $("public-news-year").onchange = () => { page=1; load(); };
  $("public-news-prev").onclick = () => { page--; load(); };
  $("public-news-next").onclick = () => { page++; load(); };
  document.addEventListener("scale-lab-language-change", () => {page=1; load();}); load();
})();
