"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const profile = require("../seed-content/meng-hao-20261020.json");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3004";
let cookie = "", csrf = "";
async function request(endpoint, method = "GET", value) {
  const multipart = value instanceof FormData;
  const response = await fetch(base + endpoint, { method,
    headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}), ...(!multipart ? { "content-type": "application/json" } : {}) },
    body: value === undefined ? undefined : multipart ? value : JSON.stringify(value) });
  if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
  const result = await response.json(); assert(response.ok, `${method} ${endpoint}: ${response.status} ${result.error?.message}`); return result;
}
const data = async (...args) => (await request(...args)).data;
async function main() {
  assert(process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD, "Set ADMIN_LOGIN and ADMIN_PASSWORD");
  csrf = (await data("/api/admin/v1/session", "POST", { login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD })).csrfToken;
  const bytes = await fs.readFile(path.join(__dirname, "../seed-media/meng-hao-20261020/portrait.jpg"));
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  const sourceNote = `用户2026-10-20提供孟皓头像，明确要求作为新入组博士后的团队头像；原文件SHA256：${sha}`;
  const evidenceNote = "用户2026-10-20提供简历和指定照片，明确要求将孟皓加入本组博士后栏目并展示照片与学术详情；依据为本次用户发布指示，不声称另有书面授权文件。";
  let asset;
  for (const archived of [false, true]) for (let page = 1; ; page++) {
    const response = await request(`/api/admin/v1/assets?pageSize=100&page=${page}&archived=${archived}`);
    asset ||= response.data.find(a => a.sourceNote === sourceNote);
    if (page * 100 >= response.meta.total) break;
  }
  if (!asset) {
    const libraries = await data("/api/admin/v1/assets/libraries"), lib = libraries.find(l => l.name === "默认图片库") || libraries[0]; assert(lib);
    const folder = lib.folders.find(f => !f.parentId && f.name === "成员照片") || await data("/api/admin/v1/assets/folders", "POST", { libraryId: lib.id, name: "成员照片" });
    const form = new FormData(); form.set("file", new Blob([bytes], { type: "image/jpeg" }), "meng-hao.jpg");
    form.set("folderId", folder.id); form.set("displayName", "孟皓 · 博士后头像"); form.set("altZh", "孟皓个人照片"); form.set("altEn", "Portrait of Hao Meng");
    form.set("credit", "用户提供"); form.set("sourceNote", sourceNote); asset = await data("/api/admin/v1/assets", "POST", form);
  }
  const photo = await data(`/api/admin/v1/assets/${asset.id}`);
  assert(!photo.archived && photo.status !== "disabled", "Existing portrait was disabled; review manually");
  for (const type of ["copyright", "people"]) if (!photo.clearances.some(c => c.type === type && c.allowed))
    await data(`/api/admin/v1/assets/${asset.id}/clearances`, "POST", { type, allowed: true, evidenceNote });
  if (photo.status !== "active") await data(`/api/admin/v1/assets/${asset.id}/activate`, "POST", {});
  const payload = { ...profile, photoAssetId: asset.id };
  const list = await data("/api/admin/v1/members?q=meng-hao"); let item = list.find(i => i.slug === profile.slug);
  if (!item) item = await data("/api/admin/v1/members", "POST", payload);
  else {
    const current = await data(`/api/admin/v1/members/${item.id}`);
    for (const key of Object.keys(payload).filter(k => k !== "locale" && k !== "interests")) assert.equal(current[key] ?? "", payload[key], `Existing member differs: ${key}; do not overwrite`);
    assert.deepEqual(current.interests, payload.interests);
  }
  let detail = await data(`/api/admin/v1/members/${item.id}`);
  for (const field of ["profile", "bio", "photo"]) if (!detail.permissions[field]?.permitted)
    await data(`/api/admin/v1/members/${item.id}/permissions`, "POST", { field, permitted: true, evidenceNote });
  if (detail.reviewState !== "ready") await data(`/api/admin/v1/members/${item.id}/check`, "POST", { expectedVersion: detail.version, locale: "zh" });
  if (!detail.published) await data(`/api/admin/v1/members/${item.id}/publish`, "POST", { expectedVersion: detail.version, locale: "zh" });
  detail = await data(`/api/admin/v1/members/${item.id}`);
  const published = await data("/api/v1/members/meng-hao");
  assert.equal(published.category, "postdoc"); assert.equal(published.profileDetails, profile.profileDetails); assert(published.hasDetails && published.photo);
  assert.equal((await fetch(base + published.photo)).status, 200); assert.equal(published.links.email, "");
  const report = { id: item.id, version: detail.version, revisionId: detail.revisionId, photoAssetId: asset.id, published: detail.published,
    category: published.category, source: "用户提供《孟皓_个人简历.pdf》（三页）及指定照片，2026-10-20", publicUrl: base + "/member.html?slug=meng-hao", detailsCharacters: profile.profileDetails.length };
  const reportFile = path.join(__dirname, "../storage/import-reports/meng-hao-20261020.json"); await fs.writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
