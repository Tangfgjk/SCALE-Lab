"use strict";
const assert = require("node:assert/strict");
const base = require("./test-environment").base;
async function main() {
  const login = await fetch(base + "/api/admin/v1/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  async function get(path, status = 200) {
    const response = await fetch(base + "/api/admin/v1/" + path, { headers: { cookie } });
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
  }
  for (const path of ["news", "members", "publications", "projects", "research-directions"]) {
    const first = await get(path + "?page=1&pageSize=10&scope=all");
    assert(first.data.length <= 10);
    assert.equal(first.meta.pageSize, 10);
    assert.equal(Object.values(first.meta.counts).reduce((a, b) => a + b, 0), first.meta.total);
    const second = await get(path + "?page=2&pageSize=10&scope=all");
    assert.equal(first.meta.total, second.meta.total);
    assert(!second.data.some(r => first.data.some(a => a.id === r.id)));
    for (const state of ["draft", "ready", "published", "changes"]) {
      const filtered = await get(path + "?pageSize=10&state=" + state);
      assert.equal(filtered.meta.total, first.meta.counts[state] || 0);
      assert(filtered.data.every(r => r.workflow_state === state));
    }
    const business = await get(path + "?scope=business&pageSize=10"), test = await get(path + "?scope=test&pageSize=10");
    assert.equal(business.meta.total + test.meta.total, first.meta.total);
    assert(business.data.every(r => !r.isTest)); assert(test.data.every(r => r.isTest));
    for (const q of ["page=0", "pageSize=101", "state=unknown", "scope=unknown", "sort=unknown"]) await get(path + "?" + q, 400);
    if (first.data.length) {
      const searched = await get(path + "?q=" + encodeURIComponent(first.data[0].slug));
      assert(searched.data.some(r => r.id === first.data[0].id));
    }
    console.log("PASS", path, { total: first.meta.total, business: business.meta.total, tests: test.meta.total });
  }
  await get("activities",410);
  for(const category of ["news","activity"]){const rows=await get("news?category="+category);assert(rows.data.every(r=>r.category===category));}
  await get("news?category=invalid",400);
  const assets = await get("assets?pageSize=10"); assert(assets.data.length <= 10); assert.equal(assets.meta.pageSize, 10);
  console.log("PASS assets pageSize 10");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
