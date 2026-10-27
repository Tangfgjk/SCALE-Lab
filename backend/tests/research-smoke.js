"use strict";

const assert = require("node:assert/strict");
const base = require("./test-environment").base;
const login = process.env.ADMIN_LOGIN, password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD for the local smoke test.");
let cookie = "", csrf = "";
async function request(path, method = "GET", data) {
  const response = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json() };
}
async function cycle(kind, draft) {
  const slug = `smoke-${kind}-${Date.now()}`;
  const path = `/api/admin/v1/${kind}`;
  const pub = `/api/v1/${kind}/${slug}`;
  const created = await request(path, "POST", { ...draft, slug });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.id;
  assert.equal((await request(pub)).status, 404);
  assert.equal((await request(`${path}/${id}/publish`, "POST", { expectedVersion: 1 })).status, 409);
  assert.equal((await request(`${path}/${id}/check`, "POST", { expectedVersion: 1 })).status, 200);
  assert.equal((await request(`${path}/${id}/publish`, "POST", { expectedVersion: 1 })).status, 200);
  assert.equal((await request(pub)).body.data.title, draft.title);
  const changed = await request(`${path}/${id}/draft`, "PUT", { ...draft, title: draft.title + " 新草稿", expectedVersion: 1 });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal((await request(pub)).body.data.title, draft.title);
  assert.equal((await request(`${path}/${id}/check`, "POST", { expectedVersion: 1 })).status, 409);
  assert.equal((await request(`${path}/${id}/check`, "POST", { expectedVersion: 2 })).status, 200);
  assert.equal((await request(`${path}/${id}/publish`, "POST", { expectedVersion: 2 })).status, 200);
  assert.equal((await request(pub)).body.data.title, draft.title + " 新草稿");
  assert.equal((await request(`${path}/${id}/withdraw`, "POST", { expectedVersion: 2 })).status, 200);
  assert.equal((await request(pub)).status, 404);
  const audit = await request("/api/admin/v1/audit-events");
  assert(audit.body.data.some(row => row.content_id === id && row.action.endsWith(".withdraw")));
}
async function main() {
  assert.equal((await request("/api/admin/v1/publications")).status, 401);
  const session = await request("/api/admin/v1/session", "POST", { login, password });
  assert.equal(session.status, 200); csrf = session.body.data.csrfToken;
  const common = { summary: "本地联调摘要", body: "本地联调正文", sourceNote: "自动化测试数据" };
  const future = await request("/api/admin/v1/publications", "POST", { ...common, slug: `future-${Date.now()}`, title: "未来论文", year: 2099, authors: "Test Author", venue: "Test Journal", stage: "published" });
  assert.equal(future.status, 400);
  const liveDirections = (await request("/api/v1/research-directions?locale=zh")).body.data;
  if (liveDirections.length) {
    assert.deepEqual(liveDirections.map(row => row.title), ["教育数据挖掘", "多模态课堂分析", "教育人工智能理论与实证"]);
    assert(liveDirections.every(row => !row.summary && !row.body && !row.participants && row.areas.length === 0));
  } else await cycle("research-directions", { ...common, title: "联调方向", themeNumber: 1, participants: "", areas: [{ title: "子主题", items: ["条目"] }] });
  await cycle("publications", { ...common, title: "联调论文", year: 2025, authors: "Test Author", venue: "Test Journal", stage: "published", doi: "", externalUrl: "", badge: "" });
  await cycle("projects", { ...common, title: "联调项目", grantCode: "", fundingType: "测试资助", role: "主持", projectStatus: "completed", startsOn: "2024-01-01", endsOn: "2025-12-31" });
  console.log(liveDirections.length
    ? "PASS: live direction names read-only; publications/projects draft isolation, review, publish, conflict, withdraw, audit"
    : "PASS: directions, publications, projects — draft isolation, review, publish, conflict, withdraw, audit");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
