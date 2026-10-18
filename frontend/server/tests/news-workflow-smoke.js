"use strict";

const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3004";
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
  const slug = `workflow-smoke-${Date.now()}`;
  const draft = { slug, locale: "zh", title: "联调测试新闻", summary: "用于验证发布链路。", body: "测试正文，公开后撤回。", happenedAt: "2026-10-13" };
  const created = await request("/api/admin/v1/news", "POST", draft);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.id;
  const savedDraft = await request(`/api/admin/v1/news/${id}`);
  assert.equal(savedDraft.body.data.sourceUrl, "");
  assert.equal(savedDraft.body.data.sourceNote, "");
  assert.equal(savedDraft.body.data.category, "news");
  async function state(expected) {
    const list = await request(`/api/admin/v1/news?q=${slug}&state=${expected}&pageSize=1`);
    assert.equal(list.status,200,JSON.stringify(list.body));
    assert.equal(list.body.meta.total,1); assert.equal(list.body.data[0].workflow_state,expected);
    assert.equal(list.body.data[0].id,id);
  }
  await state("draft");
  for (const query of ["page=0","pageSize=101","state=invalid","sort=invalid","page=1.2"]) assert.equal((await request("/api/admin/v1/news?"+query)).status,400);
  const first = await request("/api/admin/v1/news?pageSize=1&page=1&sort=date");
  const second = await request("/api/admin/v1/news?pageSize=1&page=2&sort=date");
  assert.notEqual(first.body.data[0].id,second.body.data[0].id);
  assert.equal(first.body.meta.total,second.body.meta.total);
  const empty = await request("/api/admin/v1/news?pageSize=1&page=1000000");
  assert.equal(empty.body.data.length,0); assert.equal(empty.body.meta.total,first.body.meta.total);
  const path = `/api/v1/news/${slug}`;
  assert.equal((await request(path)).status, 404);
  assert.equal((await request(`/api/admin/v1/news/${id}/publish`, "POST", { expectedVersion: 1, locale: "zh" })).status, 409);
  assert.equal((await request(`/api/admin/v1/news/${id}/check`, "POST", { expectedVersion: 1, locale: "zh" })).status, 200);
  await state("ready");
  assert.equal((await request(`/api/admin/v1/news/${id}/publish`, "POST", { expectedVersion: 1, locale: "zh" })).status, 200);
  await state("published");
  assert.equal((await request(`/api/admin/v1/news/${id}`)).body.data.currentPublished,true);
  assert.equal((await request(path)).body.data.title, draft.title);
  assert.equal((await request(path)).body.data.body, draft.body);
  const changed = await request(`/api/admin/v1/news/${id}/draft`, "PUT", { ...draft, title: "尚未发布的新标题", expectedVersion: 1 });
  assert.equal(changed.status, 200);
  await state("changes");
  const detail=(await request(`/api/admin/v1/news/${id}`)).body.data;
  assert.equal(detail.currentPublished,false); assert.equal(detail.published,true);
  assert.notEqual(detail.publishedRevisionId,detail.revisionId);
  assert.equal((await request(path)).body.data.title, draft.title);
  assert.equal((await request(`/api/admin/v1/news/${id}/check`, "POST", { expectedVersion: 1, locale: "zh" })).status, 409);
  assert.equal((await request(`/api/admin/v1/news/${id}/check`, "POST", { expectedVersion: 2, locale: "zh" })).status, 200);
  assert.equal((await request(`/api/admin/v1/news/${id}/publish`, "POST", { expectedVersion: 2, locale: "zh" })).status, 200);
  assert.equal((await request(path)).body.data.title, "尚未发布的新标题");
  await state("published");
  // An English draft increments the global version but must not mark Chinese as changed.
  assert.equal((await request(`/api/admin/v1/news/${id}/draft`, "PUT", {...draft,locale:"en",title:"English draft",expectedVersion:2})).status,200);
  await state("published");
  assert.equal((await request(`/api/admin/v1/news/${id}?locale=en`)).body.data.published,false);
  assert.equal((await request(`/api/admin/v1/news/${id}/withdraw`, "POST", { expectedVersion: 3, locale: "zh" })).status, 200);
  assert.equal((await request(path)).status, 404);
  const audit = await request("/api/admin/v1/audit-events");
  assert.equal(audit.status, 200);
  assert(audit.body.data.some(event => event.content_id === id && event.action === "news.withdraw"));
  await state("ready");
  console.log("PASS: workflow states, paging, filters, old publication isolation, locale isolation, auth, conflicts, withdraw and audit");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
