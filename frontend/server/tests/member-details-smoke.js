"use strict";
const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3004";
let cookie = "", csrf = "", item;
async function request(url, method = "GET", body, status = 200) {
  const response = await fetch(base + url, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
  const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result.data;
}
async function main() {
  const session = await request("/api/admin/v1/session", "POST", { login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD }); csrf = session.csrfToken;
  const slug = "smoke-postdoc-details-" + Date.now(), route = "/api/admin/v1/members";
  const draft = { slug, locale: "zh", category: "postdoc", nameZh: "详情隔离测试", nameEn: "Details Test", role: "博士后", bio: "测试简介", profileDetails: "## 测试标题\n- <script>not executable</script>", interests: [], sourceNote: "本地测试，结束即撤销公开授权", displayOrder: 0 };
  const publicPath = "/api/v1/members/" + slug;
  item = await request(route, "POST", draft, 201); const idPath = route + "/" + item.id;
  await request(publicPath, "GET", undefined, 404);
  await request(idPath + "/draft", "PUT", { ...draft, profileDetails: "x".repeat(20001), expectedVersion: 1 }, 400);
  await request(idPath + "/permissions", "POST", { field: "profile", permitted: true, evidenceNote: "仅本地测试" });
  await request(idPath + "/check", "POST", { expectedVersion: 1, locale: "zh" });
  await request(idPath + "/publish", "POST", { expectedVersion: 1, locale: "zh" });
  let row = await request(publicPath); assert.equal(row.hasDetails, false); assert.equal(row.profileDetails, "");
  await request(idPath + "/permissions", "POST", { field: "bio", permitted: true, evidenceNote: "仅本地测试" });
  row = await request(publicPath); assert.equal(row.hasDetails, true); assert.equal(row.profileDetails, draft.profileDetails);
  const listing = await request("/api/v1/members"); assert.equal(listing.find(r => r.slug === slug).hasDetails, true); assert(!("profileDetails" in listing.find(r => r.slug === slug)));
  await request(idPath + "/draft", "PUT", { ...draft, profileDetails: "尚未发布的详细经历", expectedVersion: 1 });
  assert.equal((await request(publicPath)).profileDetails, draft.profileDetails);
  assert.equal((await request(idPath + "?locale=en")).profileDetails, "");
  await request(idPath + "/permissions", "POST", { field: "bio", permitted: false });
  row = await request(publicPath); assert.equal(row.hasDetails, false); assert.equal(row.profileDetails, "");
  await request(idPath + "/permissions", "POST", { field: "profile", permitted: false });
  await request(publicPath, "GET", undefined, 404);
  console.log("PASS: postdoc category, detail limits, bio permission, public list minimization, draft isolation, locale fallback and permission revocation");
}
main().catch(async error => {
  if (item) try { await request(`/api/admin/v1/members/${item.id}/permissions`, "POST", { field: "profile", permitted: false }); } catch (_) {}
  console.error(error); process.exitCode = 1;
});
