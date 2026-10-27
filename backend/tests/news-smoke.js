"use strict";

const assert = require("node:assert/strict");
const base = require("./test-environment").base;
const login = process.env.ADMIN_LOGIN;
const password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD for the local smoke test.");
let cookie = "", csrf = "";

async function request(path, method = "GET", data) {
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) },
    body: data ? JSON.stringify(data) : undefined
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json() };
}

async function main() {
  assert.equal((await request("/api/health")).status, 200);
  assert.equal((await request("/api/admin/v1/news")).status, 401);
  const signedIn = await request("/api/admin/v1/session", "POST", { login, password });
  assert.equal(signedIn.status, 200);
  assert.equal((await request("/api/admin/v1/news", "POST", { slug: "csrf-blocked" })).status, 403);
  csrf = signedIn.body.data.csrfToken;
  const slug = `smoke-${Date.now()}`;
  const draft = { slug, locale: "zh", title: "联调测试新闻", summary: "用于验证发布链路。", body: "测试正文，公开后撤回。", happenedAt: "2026-10-13" };
  const created = await request("/api/admin/v1/news", "POST", draft);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.id;
  const savedDraft = await request(`/api/admin/v1/news/${id}`);
  assert.equal(savedDraft.body.data.sourceUrl, "");
  assert.equal(savedDraft.body.data.sourceNote, "");
  assert.equal(savedDraft.body.data.category, "news");
  const path = `/api/v1/news/${slug}`;
  assert.equal((await request(path)).status, 404);
  assert.equal((await request(`/api/admin/v1/news/${id}/publish`, "POST", { expectedVersion: 1, locale: "zh" })).status, 409);
  assert.equal((await request(`/api/admin/v1/news/${id}/check`, "POST", { expectedVersion: 1, locale: "zh" })).status, 200);
  assert.equal((await request(`/api/admin/v1/news/${id}/publish`, "POST", { expectedVersion: 1, locale: "zh" })).status, 200);
  assert.equal((await request(path)).body.data.title, draft.title);
  assert.equal((await request(path)).body.data.body, draft.body);
  const changed = await request(`/api/admin/v1/news/${id}/draft`, "PUT", { ...draft, title: "尚未发布的新标题", expectedVersion: 1 });
  assert.equal(changed.status, 200);
  assert.equal((await request(path)).body.data.title, draft.title);
  assert.equal((await request(`/api/admin/v1/news/${id}/check`, "POST", { expectedVersion: 1, locale: "zh" })).status, 409);
  assert.equal((await request(`/api/admin/v1/news/${id}/check`, "POST", { expectedVersion: 2, locale: "zh" })).status, 200);
  assert.equal((await request(`/api/admin/v1/news/${id}/publish`, "POST", { expectedVersion: 2, locale: "zh" })).status, 200);
  assert.equal((await request(path)).body.data.title, "尚未发布的新标题");
  assert.equal((await request(`/api/admin/v1/news/${id}/withdraw`, "POST", { expectedVersion: 2, locale: "zh" })).status, 200);
  assert.equal((await request(path)).status, 404);
  const audit = await request("/api/admin/v1/audit-events");
  assert.equal(audit.status, 200);
  assert(audit.body.data.some(event => event.content_id === id && event.action === "news.withdraw"));
  console.log("PASS: auth, draft isolation, review, publish, version conflict, withdraw, audit");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
