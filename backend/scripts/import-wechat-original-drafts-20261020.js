"use strict";

// Draft-only import. Never checks, publishes or withdraws a news revision.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { richTextOf, plainTextOf, imageIds } = require("../rich-text");
const originals = require("../seed-content/wechat-originals-20261020.json");
const summaries = require("../seed-content/wechat-news-20261018");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3004";
const mediaRoot = path.resolve(__dirname, "../seed-media/wechat-originals-20261020");
const reportPath = path.resolve(__dirname, "../storage/import-reports/wechat-original-drafts-20261020.json");
const marker = "2026-10-20公众号原文草稿";
let cookie = "", csrf = "";
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const bodyHash = doc => hash(plainTextOf(doc).replace(/\s/g, ""));

async function request(endpoint, method = "GET", value) {
  assert(!/\/(publish|withdraw|check)(?:\?|$)/.test(endpoint), "This importer is draft-only");
  const multipart = value instanceof FormData;
  const response = await fetch(base + endpoint, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(method !== "GET" ? { "x-csrf-token": csrf } : {}),
      ...(!multipart ? { "content-type": "application/json" } : {}) },
    body: value === undefined ? undefined : multipart ? value : JSON.stringify(value)
  });
  if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
  const result = await response.json();
  assert(response.ok, `${method} ${endpoint}: ${response.status} ${result.error?.message}`);
  return result;
}
const data = async (...args) => (await request(...args)).data;

async function assetsInLibrary() {
  const result = [];
  for (const archived of [false, true]) for (let page = 1; ; page++) {
    const response = await request(`/api/admin/v1/assets?page=${page}&pageSize=100&archived=${archived}`);
    result.push(...response.data);
    if (page * 100 >= response.meta.total) break;
  }
  return result;
}
async function targetFolder() {
  const libraries = await data("/api/admin/v1/assets/libraries");
  const library = libraries.find(l => l.name === "默认图片库") || libraries[0];
  assert(library, "Create a media library first");
  const parent = library.folders.find(f => !f.parentId && f.name === "新闻素材");
  const parentId = parent?.id || (await data("/api/admin/v1/assets/folders", "POST", { libraryId: library.id, name: "新闻素材" })).id;
  const existing = library.folders.find(f => f.parentId === parentId && f.name === "公众号原文草稿_20261020");
  return existing?.id || (await data("/api/admin/v1/assets/folders", "POST", { libraryId: library.id, parentId, name: "公众号原文草稿_20261020" })).id;
}
async function prepareAsset(article, image, assets, folderId) {
  const sourceNote = `${marker}；来源：${article.url}；账号：${article.account}；原图编号：${image.index}；原图：${image.url}；SHA256：${image.sha256}。`;
  let asset = assets.find(a => a.sourceNote === sourceNote) || assets.find(a => (a.sourceNote || "").includes(`SHA256：${image.sha256}`));
  if (!asset) {
    const form = new FormData();
    const mime = image.file.endsWith(".jpg") ? "image/jpeg" : image.file.endsWith(".webp") ? "image/webp" : "image/png";
    form.set("file", new Blob([await fs.readFile(path.join(mediaRoot, image.file))], { type: mime }), image.file);
    form.set("folderId", folderId); form.set("displayName", `${article.publishedAt.slice(0, 10)} ${article.title.slice(0, 80)} · 原图${image.index}`);
    form.set("altZh", `${article.account}《${article.title}》原文配图${image.index}`);
    form.set("credit", `来源：${article.account}（原报道配图）`); form.set("sourceNote", sourceNote);
    asset = await data("/api/admin/v1/assets", "POST", form); assets.push({ ...asset, sourceNote });
  }
  const detail = await data(`/api/admin/v1/assets/${asset.id}`);
  assert(!detail.archived && detail.status !== "disabled", `Image ${asset.id} was disabled/archived; do not reactivate silently`);
  if (detail.sourceNote === sourceNote) {
    const evidenceNote = `用户2026-10-20在说明版权/转载授权后明确确认“可以整篇复制”，要求六篇公众号全文和配图保存为后台草稿，后续由用户审核决定发布。授权依据为本次用户确认，不声称另有书面授权文件。来源：${article.url}；原图${image.index}。`;
    for (const type of ["copyright", "people"]) if (!detail.clearances.some(c => c.type === type && c.allowed))
      await data(`/api/admin/v1/assets/${asset.id}/clearances`, "POST", { type, allowed: true, evidenceNote });
    if (detail.status !== "active") await data(`/api/admin/v1/assets/${asset.id}/activate`, "POST", {});
  } else {
    assert(detail.status === "active" && ["copyright", "people"].every(type => detail.clearances.some(c => c.type === type && c.allowed)), `Previously used image is no longer available: ${asset.id}`);
  }
  return asset.id;
}
function resolveDocument(article, ids) {
  const doc = structuredClone(article.richText);
  doc.content.forEach(node => {
    if (node.type === "image") { node.attrs.assetId = ids[node.attrs.sourceImage]; delete node.attrs.sourceImage; }
  });
  return richTextOf(doc);
}

async function main() {
  assert(process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD, "Set ADMIN_LOGIN and ADMIN_PASSWORD");
  assert.equal(originals.length, 6);
  const session = await data("/api/admin/v1/session", "POST", { login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD });
  csrf = session.csrfToken;
  const preflight = [];
  for (const article of originals) {
    const validationIds = Object.fromEntries(article.images.map(image => [image.index, "00000000-0000-4000-8000-000000000001"]));
    assert.equal(bodyHash(resolveDocument(article, validationIds)), article.bodyTextSha256);
    const slug = summaries.find(s => s.sourceId === article.sourceId)?.slug; assert(slug);
    const list = await data("/api/admin/v1/news?q=" + encodeURIComponent(slug));
    const item = list.find(i => i.slug === slug); assert(item, `Existing news required: ${slug}`);
    const current = await data(`/api/admin/v1/news/${item.id}?locale=zh`);
    assert.equal(current.sourceUrl, article.url);
    assert(current.currentPublished || current.sourceNote.includes(marker), `Unsaved editorial draft exists: ${slug}; refusing to replace it`);
    if (current.sourceNote.includes(marker)) assert.equal(bodyHash(current.richText), article.bodyTextSha256, `Original draft was edited: ${slug}; do not overwrite`);
    for (const image of article.images) assert.equal(hash(await fs.readFile(path.join(mediaRoot, image.file))), image.sha256, image.file);
    const publicBefore = await data(`/api/v1/news/${slug}?locale=zh`);
    preflight.push({ article, current, publicBefore });
  }
  const report = { executedAt: new Date().toISOString(), mode: "original-drafts-only", folderId: await targetFolder(), articles: [] };
  const assets = await assetsInLibrary();
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  for (const { article, current, publicBefore } of preflight) {
    const ids = {};
    for (const image of article.images) ids[image.index] = await prepareAsset(article, image, assets, report.folderId);
    const richText = resolveDocument(article, ids); assert.equal(bodyHash(richText), article.bodyTextSha256);
    const sourceNote = `${marker}；原报道标题：${article.title}；来源账号：${article.account}；原报道发布时间：${article.publishedAt}；原文：${article.url}；正文无空白文字SHA256：${article.bodyTextSha256}；完整保留文字及静态配图顺序，不再摘要改写；${article.excludedImages.length}个装饰/关注/点赞动图未插入，原文件留存在来源快照。用户确认可以整篇复制；本稿仅保存草稿，不核查、不发布。`;
    const payload = { locale: "zh", title: article.title, summary: article.summary, happenedAt: article.publishedAt.slice(0, 10),
      coverAssetId: current.coverAssetId, richText, sourceUrl: article.url, sourceNote, expectedVersion: current.version };
    const same = ["title", "summary", "sourceUrl", "sourceNote"].every(k => current[k] === payload[k]) && isDeepStrictEqual(current.richText, richText);
    if (!same) {
      assert(!current.sourceNote.includes(marker), `Original draft differs from import payload: ${current.slug}; manual review needed`);
      await data(`/api/admin/v1/news/${current.id}/draft`, "PUT", payload);
    }
    const saved = await data(`/api/admin/v1/news/${current.id}?locale=zh`);
    assert.equal(saved.reviewState, "unverified"); assert.equal(saved.currentPublished, false); assert.equal(saved.published, true);
    assert.equal(bodyHash(saved.richText), article.bodyTextSha256);
    assert.deepEqual(imageIds(saved.richText), imageIds(richText));
    const after = await data(`/api/v1/news/${current.slug}?locale=zh`);
    assert.deepEqual(after, publicBefore, `Public version unexpectedly changed: ${current.slug}`);
    const preview = await data(`/api/admin/v1/news/${current.id}/preview?locale=zh`);
    for (const id of imageIds(richText)) assert(preview.media[id]?.available, `Preview media missing: ${id}`);
    report.articles.push({ id: current.id, slug: current.slug, title: saved.title, version: saved.version, revisionId: saved.revisionId,
      publishedRevisionId: saved.publishedRevisionId, originalPublishedAt: article.publishedAt, bodyCharacters: article.bodyCharacters,
      bodyTextSha256: article.bodyTextSha256, reviewState: saved.reviewState, currentPublished: saved.currentPublished,
      sourceUrl: article.url, images: ids, excludedImages: article.excludedImages, skipped: same, publicVersionPreserved: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`${same ? "Unchanged draft" : "Saved original draft"}: ${article.publishedAt} ${article.title} (${article.bodyCharacters} characters, ${article.images.length} images)`);
  }
  console.log(`Report: ${reportPath}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
