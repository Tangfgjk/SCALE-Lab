"use strict";

// Import only the three direction names confirmed in the 2026-10-13 project conversation.
const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const login = process.env.ADMIN_LOGIN, password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD in the environment.");
const directions = [
  { slug: "education-data-mining", title: "教育数据挖掘", themeNumber: 1 },
  { slug: "multimodal-classroom-analysis", title: "多模态课堂分析", themeNumber: 2 },
  { slug: "ai-in-education-theory-evidence", title: "教育人工智能理论与实证", themeNumber: 3 }
];
let cookie = "", csrf = "";
async function request(endpoint, method = "GET", data) {
  const response = await fetch(base + endpoint, { method, headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}),
    ...(data ? { "content-type": "application/json" } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0];
  const body = await response.json();
  if (!response.ok) throw new Error(`${method} ${endpoint}: ${response.status} ${body.error?.code || JSON.stringify(body)}`);
  return body.data;
}
async function main() {
  const session = await request("/api/admin/v1/session", "POST", { login, password }); csrf = session.csrfToken;
  const existing = await request("/api/v1/research-directions?locale=zh");
  if (existing.some(row => !directions.some(direction => direction.slug === row.slug))) throw new Error("An unrelated direction is published; review the current site first.");
  for (const direction of directions) {
    const current = await request("/api/admin/v1/research-directions?q=" + direction.slug);
    const item = current.find(row => row.slug === direction.slug);
    const sourceNote = "实验室负责人于 2026-10-13 确认新版前台的三类研究方向名称；简介、子主题和参与成员尚待核查，本修订仅发布名称。";
    const data = { ...direction, locale: "zh", summary: "", body: "", participants: "", areas: [], sourceNote };
    const saved = item ? await request(`/api/admin/v1/research-directions/${item.id}?locale=zh`) :
      await request("/api/admin/v1/research-directions", "POST", data);
    const id = saved.id, version = saved.version;
    if (item && (saved.title !== direction.title || saved.summary || saved.body || saved.participants || saved.areas?.length)) {
      throw new Error(`${direction.slug} exists with other content; review it in admin.`);
    }
    if (!saved.published && !item) {
      await request(`/api/admin/v1/research-directions/${id}/check`, "POST", { locale: "zh", expectedVersion: version });
      await request(`/api/admin/v1/research-directions/${id}/publish`, "POST", { locale: "zh", expectedVersion: version });
    } else if (item && !saved.published) {
      if (saved.reviewState !== "ready") await request(`/api/admin/v1/research-directions/${id}/check`, "POST", { locale: "zh", expectedVersion: version });
      await request(`/api/admin/v1/research-directions/${id}/publish`, "POST", { locale: "zh", expectedVersion: version });
    }
  }
  const published = await request("/api/v1/research-directions?locale=zh");
  assert.equal(published.length, 3);
  published.forEach((row, index) => {
    assert.equal(row.title, directions[index].title);
    assert.equal(row.summary, "");
    assert.equal(row.body, "");
    assert.equal(row.participants, "");
    assert.deepEqual(row.areas, []);
  });
  assert.deepEqual(await request("/api/v1/research-directions?locale=en"), []);
  console.log(JSON.stringify({ publishedNames: published.map(row => row.title), descriptionsPublished: false, englishPublished: false }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
