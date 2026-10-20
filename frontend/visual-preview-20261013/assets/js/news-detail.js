(function () {
  "use strict";
  var params = new URLSearchParams(window.location.search);
  var slug = params.get("slug") || "";
  var requestNumber = 0;
  var article = document.getElementById("news-article");
  var status = document.getElementById("news-detail-status");

  function isEnglish() { return document.documentElement.lang === "en"; }

  async function loadNews() {
    var currentRequest = ++requestNumber;
    var en = isEnglish();
    article.hidden = true;
    status.hidden = false;
    status.textContent = en ? "Loading news…" : "正在加载新闻…";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      status.textContent = en ? "The news link is invalid." : "新闻链接无效。";
      return;
    }
    try {
      var response = await fetch("/api/v1/news/" + encodeURIComponent(slug) + "?locale=" + (en ? "en" : "zh"));
      if (currentRequest !== requestNumber) return;
      if (response.status === 404) {
        status.textContent = en ? "This news item is unavailable in English or has been withdrawn." : "这篇新闻尚未发布或已撤回。";
        return;
      }
      if (!response.ok) throw new Error("News unavailable");
      var result = await response.json();
      if (currentRequest !== requestNumber) return;
      var news = result.data;
      var activity=news.category==='activity';
      document.querySelectorAll('.nav a,.mobile-nav a').forEach(function(link){
        link.removeAttribute('aria-current');
        if(link.getAttribute('href')===(activity ? 'culture.html' : 'news-list.html')) link.setAttribute('aria-current','page');
      });
      var back=document.querySelector('.news-back');
      back.href=activity ? 'culture.html#activity-gallery' : 'news-list.html';
      back.textContent=activity ? (en ? '← Back to lab culture' : '← 返回实验室文化') : (en ? '← Back to news' : '← 返回新闻动态');
      window.ScaleNewsArticle.render(article, news, { media: news.media, locale: en ? "en" : "zh" });
      document.title = news.title + " · SCALE Lab";
      document.querySelector('meta[name="description"]').content = news.summary;
      status.hidden = true;
      article.hidden = false;
    } catch (error) {
      if (currentRequest === requestNumber) status.textContent = en ? "News is temporarily unavailable." : "新闻暂时无法加载，请稍后再试。";
    }
  }

  document.addEventListener("scale-lab-language-change", loadNews);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadNews);
  else loadNews();
})();
