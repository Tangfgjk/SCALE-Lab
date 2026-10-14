"use strict";

const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const login = process.env.ADMIN_LOGIN, password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD.");
let cookie = "", csrf = "";
async function request(path, method = "GET", data) {
  const response = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json() };
}
async function cycle(kind, zh, en, changedFacts) {
  const slug = `bilingual-${kind}-${Date.now()}`;
  const admin = `/api/admin/v1/${kind}`;
  const publicPath = `/api/v1/${kind}/${slug}`;
  const created = await request(admin, "POST", { ...zh, slug, locale: "zh" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.id, item = `${admin}/${id}`;
  assert.equal((await request(`${item}/draft`, "PUT", { ...en, expectedVersion: 1, locale: "en" })).status, 200);
  assert.equal((await request(`${item}/check`, "POST", { expectedVersion: 2, locale: "en" })).status, 200);
  assert.equal((await request(`${item}/publish`, "POST", { expectedVersion: 2, locale: "en" })).body.error.code, "CHINESE_REQUIRED");
  assert.equal((await request(`${item}/check`, "POST", { expectedVersion: 2, locale: "zh" })).status, 200);
  assert.equal((await request(`${item}/publish`, "POST", { expectedVersion: 2, locale: "zh" })).status, 200);
  assert.equal((await request(`${item}/publish`, "POST", { expectedVersion: 2, locale: "en" })).status, 200);
  assert.equal((await request(publicPath)).body.data.title, zh.title);
  assert.equal((await request(`${publicPath}?locale=en`)).body.data.title, en.title);
  assert.equal((await request(`${item}?locale=zh`)).body.data.title, zh.title);
  assert.equal((await request(`${item}?locale=en`)).body.data.title, en.title);
  if (changedFacts) {
    const changed = await request(`${item}/draft`, "PUT", { ...zh, ...changedFacts, expectedVersion: 2, locale: "zh" });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal((await request(`${item}/check`, "POST", { expectedVersion: 3, locale: "zh" })).status, 200);
    assert.equal((await request(`${item}/publish`, "POST", { expectedVersion: 3, locale: "zh" })).status, 200);
    assert.equal((await request(`${publicPath}?locale=en`)).status, 404);
    assert.equal((await request(`${item}/publish`, "POST", { expectedVersion: 3, locale: "en" })).body.error.code, "SHARED_FACTS_CHANGED");
  }
  const version = changedFacts ? 3 : 2;
  assert.equal((await request(`${item}/withdraw`, "POST", { expectedVersion: version, locale: "zh" })).status, 200);
  assert.equal((await request(publicPath)).status, 404);
  assert.equal((await request(`${publicPath}?locale=en`)).status, 404);
}
async function main() {
  const session = await request("/api/admin/v1/session", "POST", { login, password });
  assert.equal(session.status, 200); csrf = session.body.data.csrfToken;
  const common = { summary: "本地双语联调", body: "中文测试正文", sourceNote: "本地自动化测试数据" };
  const liveDirections = (await request("/api/v1/research-directions?locale=zh")).body.data;
  if (liveDirections.length) {
    assert.deepEqual(liveDirections.map(row => row.title), ["教育数据挖掘", "多模态课堂分析", "教育人工智能理论与实证"]);
    assert.equal((await request("/api/v1/research-directions?locale=en")).body.data.length, 0);
  } else await cycle("research-directions", { ...common, title: "双语测试方向", themeNumber: 1, participants: "", areas: [{ title: "学习分析", items: ["测试"] }] }, { ...common, title: "Bilingual direction", summary: "English summary", body: "English body", themeNumber: 1, participants: "", areas: [{ title: "Learning analytics", items: ["Test"] }] });
  await cycle("publications", { ...common, title: "双语测试论文", year: 2025, authors: "Test Author", venue: "Test Journal", stage: "published", doi: "", externalUrl: "", badge: "" }, { ...common, title: "Bilingual publication", year: 2025, authors: "Test Author", venue: "Test Journal", stage: "published", doi: "", externalUrl: "", badge: "" }, { year: 2024 });
  await cycle("projects", { ...common, title: "双语测试项目", grantCode: "", fundingType: "测试资助", role: "主持", projectStatus: "completed", startsOn: "2024-01-01", endsOn: "2025-12-31" }, { ...common, title: "Bilingual project", grantCode: "", fundingType: "Test funding", role: "Lead", projectStatus: "completed", startsOn: "2024-01-01", endsOn: "2025-12-31" });
  console.log(liveDirections.length
    ? "PASS: live Chinese direction names and unpublished English read-only; bilingual publications/projects and shared fact invalidation"
    : "PASS: bilingual directions, publications and projects; Chinese first; shared fact invalidation");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
