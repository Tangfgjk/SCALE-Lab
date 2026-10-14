"use strict";

// One-time import of the site's existing editorial copy confirmed by the lab owner on 2026-10-13.
const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const login = process.env.ADMIN_LOGIN, password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD in the environment.");
let cookie = "", csrf = "";
async function request(endpoint, method = "GET", body) {
  const response = await fetch(base + endpoint, { method, headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}),
    ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0];
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${endpoint}: ${response.status} ${result.error?.code || JSON.stringify(result)}`);
  return result.data;
}

const editorial = {
  heroTitleBefore: "以智能技术理解学习，\n让课堂可被", heroHighlight: "测量、解释、优化", heroTitleAfter: "。",
  cultureTitle: "严谨，也有温度。",
  cultureVision: "让每一次学习都被温柔地理解，让每一位成员都能在严谨与自由中成长。",
  cultureValues: [
    { title: "严谨求知", text: "以可复现、可解释的方法对待每一个研究问题，欢迎对假设的质疑与对证据的坚持。" },
    { title: "跨界协作", text: "教育、计算机、心理与艺术在此交汇；我们重视不同背景带来的视角，也重视把复杂问题讲清楚的能力。" },
    { title: "以人为本", text: "技术服务于学与教。所有智能系统的终点，是让师生更从容、更有获得感。" },
    { title: "开放成长", text: "鼓励早期试错与公开分享，支持成员参加学术会议、联合培养与国际交流。" }
  ]
};

async function main() {
  const session = await request("/api/admin/v1/session", "POST", { login, password }); csrf = session.csrfToken;
  const current = await request("/api/admin/v1/settings?locale=zh");
  if (!current.published || current.name !== "智能学习分析与评价实验室" || current.contactEmail || current.stats?.length) {
    throw new Error("Expected the approved Chinese baseline with no email or statistics.");
  }
  if (current.currentPublished && current.heroTitleBefore === editorial.heroTitleBefore) {
    console.log("Confirmed editorial copy already published."); return;
  }
  if (current.heroTitleBefore && current.heroTitleBefore !== editorial.heroTitleBefore) throw new Error("A different editorial draft exists; review it in admin.");
  let version = current.globalVersion;
  const prior = await request("/api/v1/settings?locale=zh");
  assert.equal(prior.heroTitleBefore || "", "");
  const invalid = await fetch(base + "/api/admin/v1/settings/draft", { method: "PUT", headers: { cookie, "x-csrf-token": csrf, "content-type": "application/json" },
    body: JSON.stringify({ ...current, ...editorial, expectedVersion: version, cultureValues: [{ title: "", text: "invalid" }] }) });
  assert.equal(invalid.status, 400);
  let draft;
  if (current.heroTitleBefore === editorial.heroTitleBefore && !current.currentPublished) {
    draft = { revisionId: current.revisionId, version };
  } else {
    draft = await request("/api/admin/v1/settings/draft", "PUT", { ...current, ...editorial, expectedVersion: version,
      sourceNote: "实验室负责人于 2026-10-13 确认现有网站的名称、Logo、简介、办公地点和文化价值观可公开使用；本修订将已确认的文化及首页文案纳入后台。" });
    version = draft.version;
  }
  assert.equal((await request("/api/v1/settings?locale=zh")).heroTitleBefore || "", "");
  await request("/api/admin/v1/settings/check", "POST", { locale: "zh", expectedVersion: version });
  await request("/api/admin/v1/settings/publish", "POST", { locale: "zh", expectedVersion: version });
  const published = await request("/api/v1/settings?locale=zh");
  assert.equal(published.heroTitleBefore, editorial.heroTitleBefore);
  assert.equal(published.cultureVision, editorial.cultureVision);
  assert.deepEqual(published.cultureValues, editorial.cultureValues);
  assert.equal(published.contactEmail, "");
  assert.equal(published.stats.length, 0);
  assert.equal(await request("/api/v1/settings?locale=en"), null);
  console.log(JSON.stringify({ published: true, revisionId: draft.revisionId, version, cultureValues: published.cultureValues.length, englishPublished: false }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
