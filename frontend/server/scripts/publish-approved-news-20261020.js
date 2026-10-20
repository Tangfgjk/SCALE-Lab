"use strict";
// Publish the user's current saved revisions. Never imports seed text or writes drafts.
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const entries = require("../seed-content/wechat-news-20261018");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3004";
const reportDir = path.join(__dirname, "../storage/import-reports");
let cookie = "", csrf = "";
async function request(url, method = "GET", value) {
  assert(method !== "PUT", "This publication script must never edit drafts");
  const response = await fetch(base + url, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: value === undefined ? undefined : JSON.stringify(value) });
  if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
  const result = await response.json(); assert(response.ok, `${method} ${url}: ${response.status} ${result.error?.message}`); return result.data;
}
async function main() {
  assert(process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD);
  csrf = (await request("/api/admin/v1/session", "POST", { login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD })).csrfToken;
  const snapshots = [];
  for (const entry of entries) {
    const listed = await request("/api/admin/v1/news?q=" + encodeURIComponent(entry.slug));
    const item = listed.find(row => row.slug === entry.slug); assert(item);
    const current = await request(`/api/admin/v1/news/${item.id}?locale=zh`);
    assert(current.revisionId && current.body && current.title);
    const preview = await request(`/api/admin/v1/news/${item.id}/preview?locale=zh`);
    assert.equal(preview.version, current.version);
    assert(Object.values(preview.media).every(asset => asset.available), `Unavailable image in ${current.slug}`);
    snapshots.push(current);
  }
  snapshots.sort((a, b) => a.happenedAt.localeCompare(b.happenedAt));
  await fs.mkdir(reportDir, { recursive: true });
  const snapshotPath = path.join(reportDir, `news-approved-snapshots-${Date.now()}.json`);
  await fs.writeFile(snapshotPath, JSON.stringify(snapshots, null, 2) + "\n", { flag: "wx" });
  const report = { executedAt: new Date().toISOString(), authorization: "用户2026-10-20说明已修改六篇新闻草稿并明确要求发布", snapshots: snapshotPath, articles: [] };
  for (const frozen of snapshots) {
    const route = `/api/admin/v1/news/${frozen.id}`;
    const latest = await request(route + "?locale=zh");
    assert.equal(latest.version, frozen.version, "Draft changed during publication preflight");
    assert.equal(latest.revisionId, frozen.revisionId);
    if (!latest.currentPublished) {
      if (latest.reviewState !== "ready") await request(route + "/check", "POST", { expectedVersion: frozen.version, locale: "zh" });
      await request(route + "/publish", "POST", { expectedVersion: frozen.version, locale: "zh" });
    }
    const saved = await request(route + "?locale=zh"), publicNews = await request(`/api/v1/news/${frozen.slug}?locale=zh`);
    assert(saved.currentPublished && saved.published && saved.revisionId === frozen.revisionId);
    for (const key of ["title", "summary", "body", "happenedAt", "coverAssetId"]) assert.equal(publicNews[key], frozen[key]);
    assert.deepEqual(publicNews.richText, frozen.richText);
    for (const key of ["title", "summary", "body", "sourceUrl", "sourceNote"]) assert.equal(saved[key], frozen[key]);
    report.articles.push({ id: frozen.id, slug: frozen.slug, title: saved.title, version: saved.version, revisionId: saved.revisionId,
      newsDate: saved.happenedAt, publishedAt: publicNews.publishedAt, published: saved.currentPublished, alreadyPublished: !!latest.currentPublished,
      imageAssets: Object.keys(publicNews.media).length, summary: saved.summary });
    await fs.writeFile(path.join(reportDir, "news-approved-publication-20261020.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(`Published saved v${saved.version}: ${saved.happenedAt} ${saved.title}`);
  }
  console.log("User edits preserved; all six current revisions are public.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
