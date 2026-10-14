"use strict";

const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3003";
const login = process.env.ADMIN_LOGIN, password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD for the local smoke test.");
let cookie = "", csrf = "";
async function request(path, method = "GET", data) {
  const response = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json() };
}
async function main() {
  assert.equal((await request("/api/admin/v1/members")).status, 401);
  const session = await request("/api/admin/v1/session", "POST", { login, password });
  assert.equal(session.status, 200); csrf = session.body.data.csrfToken;
  const slug = `smoke-member-${Date.now()}`;
  const data = { slug, nameZh: "测试成员", nameEn: "Test Member", category: "student", role: "测试角色", bio: "测试简介", interests: ["学习分析"], homepageUrl: "", orcidUrl: "", githubUrl: "", publicEmail: "test@example.org", destination: "测试去向", sourceNote: "本地测试资料", displayOrder: 0 };
  const created = await request("/api/admin/v1/members", "POST", data);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.id;
  const pub = `/api/v1/members/${slug}`;
  assert.equal((await request(pub)).status, 404);
  assert.equal((await request(`/api/admin/v1/members/${id}/check`, "POST", { expectedVersion: 1 })).status, 409);
  const grant = await request(`/api/admin/v1/members/${id}/permissions`, "POST", { field: "profile", permitted: true, evidenceNote: "仅用于本地联调" });
  assert.equal(grant.status, 200, JSON.stringify(grant.body));
  assert.equal((await request(`/api/admin/v1/members/${id}/check`, "POST", { expectedVersion: 1 })).status, 200);
  assert.equal((await request(`/api/admin/v1/members/${id}/publish`, "POST", { expectedVersion: 1 })).status, 200);
  let row = (await request(pub)).body.data;
  assert.equal(row.nameZh, "测试成员");
  assert.equal(row.bio, ""); assert.equal(row.links.email, ""); assert.equal(row.destination, "");
  for (const field of ["bio", "email", "destination"]) {
    assert.equal((await request(`/api/admin/v1/members/${id}/permissions`, "POST", { field, permitted: true, evidenceNote: "仅用于本地联调" })).status, 200);
  }
  row = (await request(pub)).body.data;
  assert.equal(row.bio, "测试简介"); assert.equal(row.links.email, "test@example.org"); assert.equal(row.destination, "测试去向");
  assert.equal((await request(`/api/admin/v1/members/${id}/permissions`, "POST", { field: "email", permitted: false })).status, 200);
  assert.equal((await request(pub)).body.data.links.email, "");
  assert.equal((await request(`/api/admin/v1/members/${id}/permissions`, "POST", { field: "photo", permitted: true, evidenceNote: "测试" })).status, 409);
  assert.equal((await request(`/api/admin/v1/members/${id}/permissions`, "POST", { field: "profile", permitted: false })).status, 200);
  assert.equal((await request(pub)).status, 404);
  console.log("PASS: member consent gate, field visibility, immediate revocation, photo requires active asset");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
