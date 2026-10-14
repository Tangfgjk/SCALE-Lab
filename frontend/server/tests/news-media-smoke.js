"use strict";

const assert = require("node:assert/strict");
const sharp = require("sharp");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const login = process.env.ADMIN_LOGIN, password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD.");
let cookie = "", csrf = "";

async function request(path, method = "GET", data) {
  const isForm = data instanceof FormData;
  const response = await fetch(base + path, {
    method,
    headers: { ...(isForm ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) },
    body: data === undefined ? undefined : (isForm ? data : JSON.stringify(data))
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json() };
}

async function main() {
  const session = await request("/api/admin/v1/session", "POST", { login, password });
  assert.equal(session.status, 200, JSON.stringify(session.body));
  csrf = session.body.data.csrfToken;

  const bytes = await sharp({ create: { width: 18, height: 18, channels: 3, background: "#315c8d" } }).png().toBuffer();
  const upload = new FormData();
  upload.append("file", new Blob([bytes], { type: "image/png" }), "news-rich.png");
  upload.append("displayName", "新闻富文本测试图");
  upload.append("altZh", "新闻富文本测试色块");
  upload.append("credit", "本地自动化测试");
  upload.append("sourceNote", "本地合成图片，不含人物");
  const createdAsset = await request("/api/admin/v1/assets", "POST", upload);
  assert.equal(createdAsset.status, 201, JSON.stringify(createdAsset.body));
  const assetId = createdAsset.body.data.id;
  for (const type of ["copyright", "people"]) {
    const clearance = await request(`/api/admin/v1/assets/${assetId}/clearances`, "POST", { type, allowed: true, evidenceNote: "本地合成测试图，无可识别人物" });
    assert.equal(clearance.status, 200, JSON.stringify(clearance.body));
  }
  assert.equal((await request(`/api/admin/v1/assets/${assetId}/activate`, "POST", {})).status, 200);

  const slug = `smoke-news-media-${Date.now()}`;
  const richText = { schemaVersion: 1, type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "图片前的正文", marks: [{type:"textPreset",attrs:{preset:"lead"}}] }] },
    { type: "image", attrs: { assetId, caption: "自动化测试图注", width: "medium", align: "center" } },
    { type: "paragraph", content: [{ type: "text", text: "图片后的正文" }] }
  ] };
  const draft = { slug, locale: "zh", title: "新闻图片引用测试", summary: "验证富文本图片引用和停用降级。", body: "图片前的正文\n\n图片后的正文", richText, coverAssetId: assetId, happenedAt: "2026-10-14" };
  const saved = await request("/api/admin/v1/news", "POST", draft);
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  const newsId = saved.body.data.id;
  const detail = await request(`/api/admin/v1/news/${newsId}`);
  assert.equal(detail.body.data.media[assetId].available, true);
  assert.equal(detail.body.data.richText.content[1].attrs.assetId, assetId);
  assert.equal(detail.body.data.richText.content[0].content[0].marks[0].attrs.preset, "lead");
  assert.equal((await request(`/api/admin/v1/assets/${assetId}/clearances`, "POST", { type: "copyright", allowed: false, evidenceNote: "测试暂时撤权" })).status, 200);
  const rejected = await request(`/api/admin/v1/news/${newsId}/check`, "POST", { expectedVersion: 1, locale: "zh" });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.body.error.code, "ASSET_NOT_PUBLIC");
  assert.equal((await request(`/api/admin/v1/assets/${assetId}/clearances`, "POST", { type: "copyright", allowed: true, evidenceNote: "本地合成测试图" })).status, 200);
  assert.equal((await request(`/api/admin/v1/assets/${assetId}/activate`, "POST", {})).status, 200);
  assert.equal((await request(`/api/admin/v1/news/${newsId}/check`, "POST", { expectedVersion: 1, locale: "zh" })).status, 200);
  assert.equal((await request(`/api/admin/v1/news/${newsId}/publish`, "POST", { expectedVersion: 1, locale: "zh" })).status, 200);

  const publicPath = `/api/v1/news/${slug}`;
  const published = await request(publicPath);
  assert.equal(published.status, 200);
  assert.equal(published.body.data.cover.id, assetId);
  assert.equal(published.body.data.media[assetId].id, assetId);
  assert.equal((await fetch(base + `/api/v1/assets/${assetId}/file`)).status, 200);

  const libraries = await request("/api/admin/v1/assets/libraries");
  assert.equal(libraries.status, 200);
  const libraryId = libraries.body.data.find(item => item.name === "默认图片库").id;
  const folderName = `新闻测试-${Date.now()}`;
  const folder = await request("/api/admin/v1/assets/folders", "POST", { libraryId, name: folderName });
  assert.equal(folder.status, 201, JSON.stringify(folder.body));
  const folderId = folder.body.data.id;
  const moved = await request(`/api/admin/v1/assets/${assetId}`, "PUT", { folderId, displayName: "已移动的新闻测试图", altZh: "新闻富文本测试色块", credit: "本地自动化测试", sourceNote: "本地合成图片，不含人物" });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal((await request(publicPath)).body.data.cover.id, assetId);
  assert.equal((await fetch(base + `/api/v1/assets/${assetId}/file`)).status, 200);
  const renamed = await request(`/api/admin/v1/assets/folders/${folderId}`, "PATCH", { name: folderName + "-已改名" });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
  assert.equal((await request(publicPath)).body.data.cover.id, assetId);

  assert.equal((await request(`/api/admin/v1/assets/${assetId}/disable`, "POST", {})).status, 200);
  assert.equal((await fetch(base + `/api/v1/assets/${assetId}/file`)).status, 404);
  const degraded = await request(publicPath);
  assert.equal(degraded.status, 200);
  assert.equal(degraded.body.data.richText.content[1].attrs.assetId, assetId);
  assert.equal(degraded.body.data.media[assetId], undefined);

  assert.equal((await request(`/api/admin/v1/news/${newsId}/withdraw`, "POST", { expectedVersion: 1, locale: "zh" })).status, 200);
  console.log("PASS: rich-text news cover/body asset, authorization gate, stable folder move/rename, and immediate disable degradation");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
