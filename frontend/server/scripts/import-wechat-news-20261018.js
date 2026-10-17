"use strict";

// Uses the same authenticated, CSRF-protected management API as the workbench.
// Run without --publish to save drafts; add --publish after checking their previews.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const { richTextOf } = require("../rich-text");
const articles = require("../seed-content/wechat-news-20261018");
const seedRoot = path.join(__dirname, "../seed-media/wechat-news-20261018");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3004";
const publish = process.argv.includes("--publish");
const updateExisting = process.argv.includes("--update-existing");
let cookie = "", csrf = "";

async function request(endpoint, method = "GET", body) {
  const multipart = body instanceof FormData;
  const response = await fetch(base + endpoint, {
    method, headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(body !== undefined && !multipart ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body)
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${endpoint}: ${response.status} ${result.error?.code}: ${result.error?.message}`);
  return result;
}
const data = async (...args) => (await request(...args)).data;
const text = value => ({ type: "text", text: value });
const paragraph = value => ({ type: "paragraph", content: [text(value)] });
const link = (label, href) => ({ type: "paragraph", content: [{ type: "text", text: label, marks: [{ type: "link", attrs: { href } }] }] });

function documentOf(article, source, ids) {
  const content = article.blocks.map(([kind, value, option]) => {
    if (kind === "p") return paragraph(value);
    if (kind === "h") return { type: "heading", attrs: { level: 2 }, content: [text(value)] };
    if (kind === "link") return link(value, option);
    if (kind === "image") return { type: "image", attrs: { assetId: ids[value], caption: article.images[value], width: option || "large", align: "center" } };
    throw new Error(`Unknown editorial block: ${kind}`);
  });
  content.push({ type: "horizontalRule" }, paragraph(`来源：${source.account}。原报道发布时间：${source.publishedAt}。本文根据原报道整理，新闻日期采用公众号发布日，活动实际日期见正文。`),
    link("阅读微信公众号原文", source.url));
  return richTextOf({ schemaVersion: 1, type: "doc", content });
}

async function folderForImport() {
  let libraries = await data("/api/admin/v1/assets/libraries");
  let library = libraries.find(row => row.name === "默认图片库");
  if (!library) {
    library = await data("/api/admin/v1/assets/libraries", "POST", { name: "默认图片库" });
    libraries = await data("/api/admin/v1/assets/libraries");
    library = libraries.find(row => row.id === library.id);
  }
  let folders = library.folders;
  let parent = folders.find(row => !row.parentId && row.name === "新闻素材");
  if (!parent) parent = await data("/api/admin/v1/assets/folders", "POST", { libraryId: library.id, name: "新闻素材" });
  let folder = folders.find(row => row.parentId === parent.id && row.name === "王志锋相关新闻");
  if (!folder) folder = await data("/api/admin/v1/assets/folders", "POST", { libraryId: library.id, parentId: parent.id, name: "王志锋相关新闻" });
  return folder.id;
}

async function listAssets(folderId) {
  const items = [];
  for (const archived of [false, true]) {
    for (let page = 1; ; page++) {
      const result = await request(`/api/admin/v1/assets?folderId=${folderId}&pageSize=100&page=${page}&archived=${archived}`);
      items.push(...result.data);
      if (page * 100 >= result.meta.total) break;
    }
  }
  return items;
}

async function uploadImages(article, source, folderId, existing) {
  const ids = {};
  for (const image of source.images) {
    const sourceNote = `原报道：${source.url}；账号：${source.account}；发布时间：${source.publishedAt}；原图编号：${image.index}；原图：${image.url}；SHA256：${image.sha256}；2026-10-18采编。`;
    let asset = existing.find(row => row.sourceNote === sourceNote);
    if (asset) {
      const detail = await data(`/api/admin/v1/assets/${asset.id}`);
      assert(detail.status === "active" && !detail.archived && ["copyright", "people"].every(type => detail.clearances.some(c => c.type === type && c.allowed)),
        `Existing image ${image.file} is no longer public; review it in the media library before rerunning.`);
    } else {
      const form = new FormData();
      form.set("file", new Blob([await fs.readFile(path.join(seedRoot, image.file))], { type: image.file.endsWith(".jpg") ? "image/jpeg" : "image/png" }), image.file);
      form.set("folderId", folderId);
      form.set("displayName", `${source.publishedAt.slice(0, 10)} ${article.images[image.index]}`);
      form.set("altZh", article.images[image.index]);
      form.set("credit", source.id === "RjQIbgOIFWhCRn_NlCpwcw" ? "来源：华中师范大学人工智能教育学部；原文图片署名：王志锋" : `来源：${source.account}`);
      form.set("sourceNote", sourceNote);
      asset = await data("/api/admin/v1/assets", "POST", form);
      const evidenceNote = `用户2026-10-18提供原文并要求按采编方案保留有用图片，在实验室网站发布；本图沿用原文公开范围，保留来源署名。原文：${source.url}；原图编号${image.index}。依据为本次用户发布指示，不声称另有原作者书面许可。`;
      for (const type of ["copyright", "people"]) await data(`/api/admin/v1/assets/${asset.id}/clearances`, "POST", { type, allowed: true, evidenceNote });
      await data(`/api/admin/v1/assets/${asset.id}/activate`, "POST", {});
      existing.push({ ...asset, sourceNote });
    }
    ids[image.index] = asset.id;
  }
  return ids;
}

async function main() {
  assert(process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD, "Set ADMIN_LOGIN and ADMIN_PASSWORD.");
  const sources = JSON.parse(await fs.readFile(path.join(seedRoot, "sources.json"), "utf8"));
  const sourceById = new Map(sources.map(source => [source.id, source]));
  const ordered = [...articles].sort((a, b) => sourceById.get(a.sourceId).publishedAt.localeCompare(sourceById.get(b.sourceId).publishedAt));
  assert.equal(new Set(ordered.map(a => a.slug)).size, ordered.length);
  for (const article of ordered) {
    const source = sourceById.get(article.sourceId);
    assert(source && source.images.length === Object.keys(article.images).length);
    for (const image of source.images) {
      const bytes = await fs.readFile(path.join(seedRoot, image.file));
      assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), image.sha256, `Source image changed: ${image.file}`);
    }
  }
  const session = await data("/api/admin/v1/session", "POST", { login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD });
  csrf = session.csrfToken;
  const folderId = await folderForImport(), assets = await listAssets(folderId);
  const report = { executedAt: new Date().toISOString(), base, mode: publish ? "publish" : "draft", folderId, articles: [] };
  for (const article of ordered) {
    const source = sourceById.get(article.sourceId);
    const ids = await uploadImages(article, source, folderId, assets);
    const payload = { slug: article.slug, locale: "zh", title: article.title, summary: article.summary, happenedAt: source.publishedAt.slice(0, 10),
      coverAssetId: ids[article.cover], richText: documentOf(article, source, ids), sourceUrl: source.url,
      sourceNote: `来源账号：${source.account}；原报道标题：${source.title}；原报道发布时间：${source.publishedAt}；2026-10-18全文阅读并按用户认可方案重新编写、选择配图。用户要求新闻日期及发布顺序依公众号发布时间；活动日期见正文，不倒填网站实际发布记录。` };
    const list = await data(`/api/admin/v1/news?q=${encodeURIComponent(article.slug)}`);
    let item = list.find(row => row.slug === article.slug), created = false;
    if (item) {
      const current = await data(`/api/admin/v1/news/${item.id}?locale=zh`);
      assert.equal(current.sourceUrl, payload.sourceUrl, `Existing source differs: ${article.slug}`);
      const same = ["title", "summary", "sourceUrl", "sourceNote", "coverAssetId"].every(key => current[key] === payload[key]) &&
        String(current.happenedAt).slice(0, 10) === payload.happenedAt && isDeepStrictEqual(current.richText, payload.richText);
      assert(same || updateExisting, `Existing news differs: ${article.slug}; review the change before explicitly using --update-existing.`);
      item = same ? current : await data(`/api/admin/v1/news/${item.id}/draft`, "PUT", { ...payload, expectedVersion: current.version });
    } else {
      const sameSource = (await data(`/api/admin/v1/news?q=${encodeURIComponent(article.title)}`));
      assert(!sameSource.length, `Possible existing article with a different slug: ${article.title}`);
      item = await data("/api/admin/v1/news", "POST", payload);
      created = true;
    }
    const preview = await data(`/api/admin/v1/news/${item.id}/preview?locale=zh`);
    assert.equal(preview.title, article.title);
    for (const id of Object.values(ids)) assert(preview.media[id]?.available, `Preview image unavailable: ${id}`);
    if (publish && !item.published) {
      await data(`/api/admin/v1/news/${item.id}/check`, "POST", { locale: "zh", expectedVersion: item.version });
      await data(`/api/admin/v1/news/${item.id}/publish`, "POST", { locale: "zh", expectedVersion: item.version });
    }
    const detail = await data(`/api/admin/v1/news/${item.id}?locale=zh`);
    if (publish) {
      const publicArticle = await data(`/api/v1/news/${article.slug}?locale=zh`);
      assert.equal(publicArticle.happenedAt, payload.happenedAt);
      assert.deepEqual(publicArticle.richText, payload.richText);
      for (const image of Object.values(publicArticle.media)) assert.equal((await fetch(base + image.url)).status, 200);
    }
    report.articles.push({ id: item.id, slug: article.slug, title: article.title, originalPublishedAt: source.publishedAt, newsDate: payload.happenedAt,
      created, version: detail.version, revisionId: detail.revisionId, reviewState: detail.reviewState, checkedAt: detail.checkedAt,
      published: detail.published, publicUrl: `${base}/news.html?slug=${article.slug}`, sourceUrl: source.url, media: ids });
    console.log(`${detail.published ? "Published" : "Draft"}: ${payload.happenedAt} ${article.slug}`);
  }
  if (publish) {
    const list = (await data("/api/v1/news?locale=zh")).filter(row => ordered.some(article => article.slug === row.slug));
    assert.deepEqual(list.map(row => row.slug), [...ordered].reverse().map(article => article.slug));
    report.articles.forEach(article => { article.publishedAt = list.find(row => row.slug === article.slug).publishedAt; });
  }
  const reportDir = path.join(__dirname, "../storage/import-reports");
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `wechat-news-20261018-${report.mode}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`Report: ${reportPath}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
