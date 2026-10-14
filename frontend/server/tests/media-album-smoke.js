"use strict";

const assert = require("node:assert/strict");
const sharp = require("sharp");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const login = process.env.ADMIN_LOGIN, password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD.");
let cookie = "", csrf = "";
async function request(path, method = "GET", data) {
  const body = data instanceof FormData ? data : data ? JSON.stringify(data) : undefined;
  const response = await fetch(base + path, { method, headers: { ...(data instanceof FormData ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) }, body });
  const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json() };
}
async function main() {
  assert.equal((await request("/api/admin/v1/assets")).status, 401);
  const session = await request("/api/admin/v1/session", "POST", { login, password });
  assert.equal(session.status, 200); csrf = session.body.data.csrfToken;
  const bad = new FormData(); bad.append("file", new Blob(["not an image"], { type: "image/png" }), "fake.png"); bad.append("sourceNote", "本地测试");
  assert.equal((await request("/api/admin/v1/assets", "POST", bad)).body.error.code, "INVALID_IMAGE");
  const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#26758a" } }).png().toBuffer();
  const upload = new FormData(); upload.append("file", new Blob([bytes], { type: "image/png" }), "sample.png");
  upload.append("altZh", "本地测试色块"); upload.append("altEn", "Local test image"); upload.append("credit", "本地自动化测试"); upload.append("sourceNote", "本地生成的合成色块，不含人物");
  const created = await request("/api/admin/v1/assets", "POST", upload);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const assetId = created.body.data.id, asset = `/api/admin/v1/assets/${assetId}`, file = `/api/v1/assets/${assetId}/file`;
  assert.equal((await request(`${asset}/activate`, "POST", {})).body.error.code, "CLEARANCE_REQUIRED");
  assert.equal((await fetch(base + file)).status, 404);
  assert.equal((await request(`${asset}/clearances`, "POST", { type: "copyright", allowed: true, evidenceNote: "本地合成测试图" })).status, 200);
  assert.equal((await request(`${asset}/clearances`, "POST", { type: "people", allowed: true, evidenceNote: "本地合成测试图，无可识别人物" })).status, 200);
  assert.equal((await request(`${asset}/activate`, "POST", {})).status, 200);
  const imageResponse = await fetch(base + file);
  assert.equal(imageResponse.status, 200); assert.equal(imageResponse.headers.get("content-type"), "image/webp");
  const slug = `smoke-album-${Date.now()}`;
  const draft = { slug, locale: "zh", title: "本地相册测试", summary: "合成图片的相册联调", body: "测试正文", activityDate: "2026-10-13", location: "本地", sourceNote: "本地自动化测试数据", images: [{ assetId, caption: "测试色块" }] };
  const album = await request("/api/admin/v1/activities", "POST", draft);
  assert.equal(album.status, 201, JSON.stringify(album.body));
  const id = album.body.data.id, adminAlbum = `/api/admin/v1/activities/${id}`, publicAlbum = `/api/v1/activities/${slug}`;
  assert.equal((await request(publicAlbum)).status, 404);
  assert.equal((await request(`${adminAlbum}/check`, "POST", { expectedVersion: 1, locale: "zh" })).status, 200);
  assert.equal((await request(`${adminAlbum}/publish`, "POST", { expectedVersion: 1, locale: "zh" })).status, 200);
  assert.equal((await request(publicAlbum)).body.data.cover.id, assetId);
  const english = { ...draft, locale: "en", title: "Local album test", summary: "Synthetic image", body: "Test body", location: "Local", images: [{ assetId, caption: "Test color block" }] };
  assert.equal((await request(`${adminAlbum}/draft`, "PUT", { ...english, expectedVersion: 1 })).status, 200);
  assert.equal((await request(`${adminAlbum}/check`, "POST", { expectedVersion: 2, locale: "en" })).status, 200);
  assert.equal((await request(`${adminAlbum}/publish`, "POST", { expectedVersion: 2, locale: "en" })).status, 200);
  assert.equal((await request(`${publicAlbum}?locale=en`)).body.data.images[0].caption, "Test color block");
  assert.equal((await request(`${asset}/usages`)).body.data.some(item => item.slug === slug), true);
  assert.equal((await request(`${asset}/disable`, "POST", {})).status, 200);
  assert.equal((await fetch(base + file)).status, 404);
  assert.equal((await request(publicAlbum)).status, 404);
  assert.equal((await request(`${publicAlbum}?locale=en`)).status, 404);
  assert.equal((await request(`${adminAlbum}/withdraw`, "POST", { expectedVersion: 2, locale: "zh" })).status, 200);
  console.log("PASS: image validation, approval gates, bilingual album, public filtering, immediate image disable");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
