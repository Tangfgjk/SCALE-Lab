"use strict";

const assert = require("node:assert/strict");
const base = require("./test-environment").base;
const login = process.env.ADMIN_LOGIN;
const password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD.");
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
  const signedIn = await request("/api/admin/v1/session", "POST", { login, password });
  assert.equal(signedIn.status, 200);
  csrf = signedIn.body.data.csrfToken;
  const slug = `bilingual-smoke-${Date.now()}`;
  const zh = { slug, locale: "zh", title: "双语验证", summary: "中文摘要", body: "中文正文", happenedAt: "2026-10-13", category: "news", sourceNote: "本地测试数据" };
  const created = await request("/api/admin/v1/news", "POST", zh);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.id;
  const adminPath = `/api/admin/v1/news/${id}`;
  const publicPath = `/api/v1/news/${slug}`;
  const en = { ...zh, locale: "en", title: "Bilingual verification", summary: "English summary", body: "English body" };
  assert.equal((await request(`${adminPath}/draft`, "PUT", { ...en, expectedVersion: 1 })).status, 200);
  assert.equal((await request(`${adminPath}/check`, "POST", { expectedVersion: 2, locale: "en" })).status, 200);
  assert.equal((await request(`${adminPath}/publish`, "POST", { expectedVersion: 2, locale: "en" })).body.error.code, "CHINESE_REQUIRED");
  assert.equal((await request(`${adminPath}/check`, "POST", { expectedVersion: 2, locale: "zh" })).status, 200);
  assert.equal((await request(`${adminPath}/publish`, "POST", { expectedVersion: 2, locale: "zh" })).status, 200);
  assert.equal((await request(`${adminPath}/publish`, "POST", { expectedVersion: 2, locale: "en" })).status, 200);
  assert.equal((await request(publicPath)).body.data.title, zh.title);
  assert.equal((await request(`${publicPath}?locale=en`)).body.data.title, en.title);
  assert.equal((await request(`${adminPath}?locale=zh`)).body.data.title, zh.title);
  assert.equal((await request(`${adminPath}?locale=en`)).body.data.title, en.title);
  assert.equal((await request("/api/admin/v1/news?q=%E5%8F%8C%E8%AF%AD%E9%AA%8C%E8%AF%81")).body.data.find(row => row.id === id).title, zh.title);
  const zhChanged = await request(`${adminPath}/draft`, "PUT", { ...zh, happenedAt: "2026-10-12", expectedVersion: 2 });
  assert.equal(zhChanged.status, 200);
  assert.equal((await request(`${adminPath}/check`, "POST", { expectedVersion: 3, locale: "zh" })).status, 200);
  assert.equal((await request(`${adminPath}/publish`, "POST", { expectedVersion: 3, locale: "zh" })).status, 200);
  assert.equal((await request(`${publicPath}?locale=en`)).status, 404);
  assert.equal((await request(publicPath)).body.data.happenedAt, "2026-10-12");
  assert.equal((await request(`${adminPath}/publish`, "POST", { expectedVersion: 3, locale: "en" })).body.error.code, "SHARED_FACTS_CHANGED");
  const audit = await request("/api/admin/v1/audit-events");
  assert(audit.body.data.some(event => event.content_id === id && event.action === "news.invalidate_en"));
  assert.equal((await request(`${adminPath}/withdraw`, "POST", { expectedVersion: 3, locale: "zh" })).status, 200);
  assert.equal((await request(publicPath)).status, 404);
  console.log("PASS: independent language drafts, Chinese first, per-locale review and publication, shared-fact invalidation");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
