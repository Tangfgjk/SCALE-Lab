"use strict";

const assert = require("node:assert/strict");
const { pool } = require("../db/pool");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const login = process.env.ADMIN_LOGIN, password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD.");
let cookie = "", csrf = "";
let initialVersion = null;
async function request(path, method = "GET", data) {
  const response = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json() };
}
async function main() {
  assert.equal((await request("/api/admin/v1/settings")).status, 401);
  const session = await request("/api/admin/v1/session", "POST", { login, password });
  assert.equal(session.status, 200); csrf = session.body.data.csrfToken;
  const first = (await request("/api/admin/v1/settings")).body.data;
  if (first.published) {
    const publicZh = (await request("/api/v1/settings?locale=zh")).body.data;
    assert.equal(publicZh.name, "智能学习分析与评价实验室");
    assert.equal(publicZh.cultureValues.length, 4);
    assert.equal(publicZh.heroHighlight, "测量、解释、优化");
    assert.equal(publicZh.contactEmail, "");
    assert.equal((await request("/api/v1/settings?locale=en")).body.data, null);
    assert.equal((await request("/api/admin/v1/settings/draft", "PUT", {
      ...first, expectedVersion: first.globalVersion,
      cultureValues: [{ title: "", text: "invalid" }]
    })).body.error.code, "INVALID_CULTURE");
    console.log("PASS: published Chinese settings, editorial fields and validation (read-only live check)");
    return;
  }
  initialVersion = first.globalVersion;
  const zh = { locale: "zh", name: "本地测试实验室", shortName: "Test Lab", intro: "仅供本地自动化验证", tagline: "测试标语",
    department: "测试单位", university: "测试大学", location: "本地", contactEmail: "", logoAssetId: null,
    featured: { newsSlugs: [], directionSlugs: [], publicationSlugs: [] }, stats: [], sourceNote: "本地自动化合成数据", expectedVersion: first.globalVersion };
  assert.equal((await request("/api/admin/v1/settings/draft", "PUT", { ...zh, sourceNote: "" })).body.error.code, "SOURCE_REQUIRED");
  const assets = (await request("/api/admin/v1/assets")).body.data;
  const inactive = assets.find(asset => asset.status !== "active");
  if (inactive) assert.equal((await request("/api/admin/v1/settings/draft", "PUT", { ...zh, logoAssetId: inactive.id })).status, 200);
  else assert.equal((await request("/api/admin/v1/settings/draft", "PUT", zh)).status, 200);
  let version = first.globalVersion + 1;
  if (inactive) assert.equal((await request("/api/admin/v1/settings/check", "POST", { locale: "zh", expectedVersion: version })).body.error.code, "LOGO_NOT_CLEARED");
  assert.equal((await request("/api/admin/v1/settings/draft", "PUT", { ...zh, expectedVersion: version })).status, 200); version++;
  assert.equal((await request("/api/admin/v1/settings/publish", "POST", { locale: "zh", expectedVersion: version })).body.error.code, "NOT_CHECKED");
  assert.equal((await request("/api/admin/v1/settings/check", "POST", { locale: "zh", expectedVersion: version })).status, 200);
  assert.equal((await request("/api/admin/v1/settings/publish", "POST", { locale: "zh", expectedVersion: version })).status, 200);
  assert.equal((await request("/api/v1/settings")).body.data.name, zh.name);
  const en = { ...zh, locale: "en", name: "Local Test Lab", intro: "Synthetic local test", tagline: "Test slogan", sourceNote: "Synthetic local test", expectedVersion: version };
  assert.equal((await request("/api/admin/v1/settings/draft", "PUT", { ...en, contactEmail: "wrong@example.org" })).status, 200); version++;
  assert.equal((await request("/api/admin/v1/settings/check", "POST", { locale: "en", expectedVersion: version })).status, 200);
  assert.equal((await request("/api/admin/v1/settings/publish", "POST", { locale: "en", expectedVersion: version })).body.error.code, "SHARED_FACTS_CHANGED");
  assert.equal((await request("/api/admin/v1/settings/draft", "PUT", { ...en, expectedVersion: version })).status, 200); version++;
  assert.equal((await request("/api/admin/v1/settings/check", "POST", { locale: "en", expectedVersion: version })).status, 200);
  assert.equal((await request("/api/admin/v1/settings/publish", "POST", { locale: "en", expectedVersion: version })).status, 200);
  assert.equal((await request("/api/v1/settings?locale=en")).body.data.name, en.name);
  assert.equal((await request("/api/admin/v1/settings/draft", "PUT", { ...zh, expectedVersion: version, contactEmail: "checked@example.org" })).status, 200); version++;
  assert.equal((await request("/api/admin/v1/settings/check", "POST", { locale: "zh", expectedVersion: version })).status, 200);
  assert.equal((await request("/api/admin/v1/settings/publish", "POST", { locale: "zh", expectedVersion: version })).status, 200);
  assert.equal((await request("/api/v1/settings?locale=en")).body.data, null);
  assert.equal((await request("/api/admin/v1/settings/withdraw", "POST", { locale: "zh", expectedVersion: version })).status, 200);
  assert.equal((await request("/api/v1/settings")).body.data, null);
  console.log("PASS: settings source gate, logo clearance, check/publish, bilingual shared facts, withdrawal");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try {
    if (initialVersion !== null) {
      await pool.query(`DELETE FROM site_setting_publications WHERE revision_id IN
        (SELECT id FROM site_setting_revisions WHERE version > $1 AND name IN ('本地测试实验室','Local Test Lab'))`, [initialVersion]);
      await pool.query("DELETE FROM site_setting_revisions WHERE version > $1 AND name IN ('本地测试实验室','Local Test Lab')", [initialVersion]);
    }
  } catch (error) { console.error("Fixture cleanup failed:", error); process.exitCode = 1; }
  await pool.end();
});
