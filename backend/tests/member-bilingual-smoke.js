"use strict";

const assert = require("node:assert/strict");
const base = require("./test-environment").base;
const login = process.env.ADMIN_LOGIN, password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD.");
let cookie = "", csrf = "";
async function request(path, method = "GET", data) {
  const response = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json() };
}
async function main() {
  const session = await request("/api/admin/v1/session", "POST", { login, password });
  assert.equal(session.status, 200); csrf = session.body.data.csrfToken;
  const slug = `bilingual-member-${Date.now()}`;
  const zh = { slug, locale: "zh", nameZh: "本地双语测试成员", nameEn: "Local Test Member", category: "student", role: "测试学生", bio: "中文简介", interests: ["学习分析"], homepageUrl: "", orcidUrl: "", githubUrl: "", publicEmail: "test@example.org", destination: "", sourceNote: "本地自动化测试数据", displayOrder: 0 };
  const en = { ...zh, locale: "en", role: "Test student", bio: "English bio", interests: ["Learning analytics"] };
  const created = await request("/api/admin/v1/members", "POST", zh);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.id, admin = `/api/admin/v1/members/${id}`, pub = `/api/v1/members/${slug}`;
  assert.equal((await request(`${admin}/draft`, "PUT", { ...en, expectedVersion: 1 })).status, 200);
  assert.equal((await request(`${admin}/permissions`, "POST", { field: "profile", permitted: true, evidenceNote: "仅本地测试，结束即撤销" })).status, 200);
  assert.equal((await request(`${admin}/check`, "POST", { expectedVersion: 2, locale: "en" })).status, 200);
  assert.equal((await request(`${admin}/publish`, "POST", { expectedVersion: 2, locale: "en" })).body.error.code, "CHINESE_REQUIRED");
  assert.equal((await request(`${admin}/check`, "POST", { expectedVersion: 2, locale: "zh" })).status, 200);
  assert.equal((await request(`${admin}/publish`, "POST", { expectedVersion: 2, locale: "zh" })).status, 200);
  assert.equal((await request(`${admin}/publish`, "POST", { expectedVersion: 2, locale: "en" })).status, 200);
  assert.equal((await request(pub)).body.data.role, zh.role);
  assert.equal((await request(`${pub}?locale=en`)).body.data.role, en.role);
  assert.equal((await request(`${pub}?locale=en`)).body.data.bio, "");
  assert.equal((await request(`${admin}/permissions`, "POST", { field: "bio", permitted: true, evidenceNote: "仅本地测试，结束即撤销" })).status, 200);
  assert.equal((await request(`${pub}?locale=en`)).body.data.bio, en.bio);
  assert.equal((await request(`${admin}/permissions`, "POST", { field: "bio", permitted: false })).status, 200);
  assert.equal((await request(`${pub}?locale=en`)).body.data.bio, "");
  assert.equal((await request(`${admin}/draft`, "PUT", { ...zh, category: "researcher", expectedVersion: 2 })).status, 200);
  assert.equal((await request(`${admin}/check`, "POST", { expectedVersion: 3, locale: "zh" })).status, 200);
  assert.equal((await request(`${admin}/publish`, "POST", { expectedVersion: 3, locale: "zh" })).status, 200);
  assert.equal((await request(`${pub}?locale=en`)).status, 404);
  assert.equal((await request(`${admin}/publish`, "POST", { expectedVersion: 3, locale: "en" })).body.error.code, "SHARED_FACTS_CHANGED");
  assert.equal((await request(`${admin}/permissions`, "POST", { field: "profile", permitted: false })).status, 200);
  assert.equal((await request(pub)).status, 404);
  assert.equal((await request(`${pub}?locale=en`)).status, 404);
  console.log("PASS: bilingual member drafts and publication, Chinese first, field permission, immediate both-language revocation");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
