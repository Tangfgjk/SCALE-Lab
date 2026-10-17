(function (global) {
  "use strict";

  function render(article, news, options = {}) {
    const en = options.locale === "en";
    const header = document.createElement("header");
    header.className = "news-article-head";
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "Lab News";
    const title = document.createElement("h1");
    title.className = "declaration";
    title.textContent = news.title || "";
    const date = document.createElement("p");
    date.className = "news-article-date";
    date.textContent = (en ? "News date: " : "新闻日期：") + (news.happenedAt || "");
    const summary = document.createElement("p");
    summary.className = "news-article-summary";
    summary.textContent = news.summary || "";
    header.append(eyebrow, title, date, summary);

    const cover = document.createElement("div");
    cover.className = "news-article-cover rich-document";
    global.ScaleRichRenderer.render(cover, {
      type: "doc",
      content: news.coverAssetId ? [{ type: "image", attrs: { assetId: news.coverAssetId, width: "large", align: "center" } }] : []
    }, { media: options.media || {}, locale: options.locale });

    const body = document.createElement("div");
    body.className = "news-article-body rich-document";
    if (news.richText) global.ScaleRichRenderer.render(body, news.richText, { media: options.media || {}, locale: options.locale });
    else body.textContent = news.body || "";
    article.classList.add("news-article");
    article.replaceChildren(header, cover, body);
  }

  global.ScaleNewsArticle = { render };
})(window);
