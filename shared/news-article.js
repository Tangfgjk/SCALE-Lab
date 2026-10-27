(function (global) {
  "use strict";

  const compactText = value => String(value || "").replace(/\s+/g, "");
  function containsImage(node, assetId) {
    return !!node && ((node.type === "image" && node.attrs?.assetId === assetId) ||
      (node.content || []).some(child => containsImage(child, assetId)));
  }

  function render(article, news, options = {}) {
    const en = options.locale === "en";
    const activity = news.category === "activity";
    const body = document.createElement("div");
    body.className = "news-article-body rich-document";
    if (news.richText) global.ScaleRichRenderer.render(body, news.richText, { media: options.media || {}, locale: options.locale });
    else body.textContent = news.body || "";
    const header = document.createElement("header");
    header.className = "news-article-head";
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = activity ? "Lab Life" : "Lab News";
    const title = document.createElement("h1");
    title.className = "declaration";
    title.textContent = news.title || "";
    const date = document.createElement("p");
    date.className = "news-article-date";
    date.textContent = (activity ? (en ? "Activity date: " : "活动日期：") : (en ? "News date: " : "新闻日期：")) + (news.happenedAt || "");
    if (activity && news.location) date.textContent += " · " + news.location;
    const summary = document.createElement("p");
    summary.className = "news-article-summary";
    summary.textContent = news.summary || "";
    header.append(eyebrow, title, date);
    // Metadata is also used by list cards. Do not repeat it when the author included it in the article body.
    const summaryText = compactText(news.summary);
    if (summaryText && !compactText(body.textContent).includes(summaryText)) header.append(summary);

    let cover = null;
    if (news.coverAssetId && !containsImage(news.richText, news.coverAssetId)) {
      cover = document.createElement("div");
      cover.className = "news-article-cover rich-document";
      global.ScaleRichRenderer.render(cover, {
        type: "doc", content: [{ type: "image", attrs: { assetId: news.coverAssetId, width: "large", align: "center" } }]
      }, { media: options.media || {}, locale: options.locale });
    }
    article.classList.add("news-article");
    article.replaceChildren(...[header, cover, body].filter(Boolean));
  }

  global.ScaleNewsArticle = { render };
})(window);
