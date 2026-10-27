async (page) => {
  return await page.evaluate(() => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const image = id => ({ type: "image", attrs: { assetId: id, width: "large", align: "center" } });
    const paragraph = value => ({ type: "paragraph", content: [{ type: "text", text: value }] });
    const media = { cover: { url: "/api/v1/assets/00000000-0000-4000-8000-000000000001/file", alt: "Cover" } };
    const article = document.createElement("article");
    const duplicated = { title: "Test", happenedAt: "2026-10-20", summary: "First paragraph.", coverAssetId: "cover",
      richText: { type: "doc", content: [paragraph("First paragraph."), image("cover"), paragraph("Remaining body.")] } };
    window.ScaleNewsArticle.render(article, duplicated, { media });
    assert(!article.querySelector(".news-article-summary"), "FAIL: summary repeats body introduction");
    assert(!article.querySelector(".news-article-cover"), "FAIL: cover repeats image already in body");
    assert(article.querySelectorAll("img").length === 1, "Body image must remain exactly once");
    assert(article.querySelector(".news-article-body").textContent.includes("Remaining body."), "Body content was lost");
    window.ScaleNewsArticle.render(article, { ...duplicated, summary: "Separate editorial introduction.", richText: { type: "doc", content: [paragraph("Different body.")] } }, { media });
    assert(article.querySelector(".news-article-summary")?.textContent === "Separate editorial introduction.", "Distinct summary must remain");
    assert(article.querySelectorAll(".news-article-cover img").length === 1, "Cover absent from body must remain");
    window.ScaleNewsArticle.render(article, { ...duplicated, summary: "First paragraph.", richText: { type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "First ", marks: [{ type: "bold" }] }, { type: "text", text: "paragraph." }] },
      { type: "blockquote", content: [image("cover")] }, paragraph("Repeated paragraph stays."), paragraph("Repeated paragraph stays.")
    ] } }, { media });
    assert(!article.querySelector(".news-article-summary") && !article.querySelector(".news-article-cover"), "Formatted body or nested image broke duplicate detection");
    assert(article.querySelectorAll(".news-article-body p").length === 3, "Do not delete intentional repetition inside body");
    window.ScaleNewsArticle.render(article, { ...duplicated, richText: null, body: "First paragraph.\nRemaining body." }, { media });
    assert(!article.querySelector(".news-article-summary"), "Plain-text body must also avoid repeating summary");
    assert(article.querySelectorAll(".news-article-body").length === 1, "Repeated renders must replace, not append article bodies");
    return "PASS: repeated summary/cover suppressed; distinct metadata, nested images, body text, plain text and rerender preserved";
  });
}
