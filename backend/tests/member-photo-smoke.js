"use strict";

const assert = require("node:assert/strict");
const sharp = require("sharp");
const base = require("./test-environment").base;
const login = process.env.ADMIN_LOGIN, password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD.");
let cookie = "", csrf = "";
async function request(endpoint, method = "GET", data) {
  const multipart = data instanceof FormData;
  const response = await fetch(base + endpoint, { method, headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}),
    ...(data && !multipart ? { "content-type": "application/json" } : {}) }, body: multipart ? data : data ? JSON.stringify(data) : undefined });
  const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json() };
}
async function main() {
  const session = await request("/api/admin/v1/session", "POST", { login, password });
  assert.equal(session.status, 200); csrf = session.body.data.csrfToken;
  const bytes = await sharp({ create: { width: 48, height: 64, channels: 3, background: "#547b92" } }).png().toBuffer();
  const upload = new FormData(); upload.set("file", new Blob([bytes], { type: "image/png" }), "synthetic.png");
  upload.set("altZh", "自动化测试头像"); upload.set("credit", "本地生成"); upload.set("sourceNote", "合成色块，无真实人物");
  const asset = await request("/api/admin/v1/assets", "POST", upload);
  assert.equal(asset.status, 201, JSON.stringify(asset.body));
  const assetId = asset.body.data.id;
  for (const type of ["copyright", "people"]) {
    assert.equal((await request(`/api/admin/v1/assets/${assetId}/clearances`, "POST", { type, allowed: true, evidenceNote: "本地合成色块，无真实人物" })).status, 200);
  }
  assert.equal((await request(`/api/admin/v1/assets/${assetId}/activate`, "POST", {})).status, 200);
  const slug = `smoke-member-photo-${Date.now()}`;
  const member = await request("/api/admin/v1/members", "POST", { slug, locale: "zh", nameZh: "头像测试成员", category: "researcher", role: "本地测试",
    bio: "", interests: [], sourceNote: "本地自动化测试", photoAssetId: assetId, displayOrder: 9999 });
  assert.equal(member.status, 201, JSON.stringify(member.body));
  const id = member.body.data.id;
  for (const field of ["profile", "photo"]) {
    assert.equal((await request(`/api/admin/v1/members/${id}/permissions`, "POST", { field, permitted: true, evidenceNote: "本地自动化测试" })).status, 200);
  }
  assert.equal((await request(`/api/admin/v1/members/${id}/check`, "POST", { expectedVersion: 1 })).status, 200);
  assert.equal((await request(`/api/admin/v1/members/${id}/publish`, "POST", { expectedVersion: 1 })).status, 200);
  const publicMember = `/api/v1/members/${slug}`;
  const visible = await request(publicMember);
  assert.equal(visible.body.data.photo, `/api/v1/assets/${assetId}/file`);
  assert.equal((await request(`/api/admin/v1/assets/${assetId}/usages`)).body.data.some(row => row.slug === slug), true);
  assert.equal((await request(`/api/admin/v1/assets/${assetId}/disable`, "POST", {})).status, 200);
  assert.equal((await request(publicMember)).body.data.photo, "");
  assert.equal((await fetch(base + `/api/v1/assets/${assetId}/file`)).status, 404);
  assert.equal((await request(`/api/admin/v1/members/${id}/permissions`, "POST", { field: "profile", permitted: false })).status, 200);
  assert.equal((await request(publicMember)).status, 404);
  console.log("PASS: member photo media link, permission, usage, immediate disable and profile withdrawal");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
