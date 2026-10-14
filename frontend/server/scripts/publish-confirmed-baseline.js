"use strict";

// One-time local content import after the lab owner confirmed the existing public baseline on 2026-10-13.
// Run against a local server with ADMIN_LOGIN and ADMIN_PASSWORD in the environment.
const fs = require("node:fs/promises");
const path = require("node:path");

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const login = process.env.ADMIN_LOGIN;
const password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD in the environment.");

let cookie = "", csrf = "";
async function request(endpoint, method = "GET", data, multipart = false) {
  const response = await fetch(base + endpoint, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(!multipart && data ? { "content-type": "application/json" } : {}) },
    body: data ? multipart ? data : JSON.stringify(data) : undefined
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const body = await response.json();
  if (!response.ok) throw new Error(`${method} ${endpoint}: ${response.status} ${body.error?.code || JSON.stringify(body)}`);
  return body.data;
}

async function main() {
  const session = await request("/api/admin/v1/session", "POST", { login, password });
  csrf = session.csrfToken;
  const current = await request("/api/admin/v1/settings?locale=zh");
  if (current.published) throw new Error("A Chinese site setting is already published; review it in admin before replacing it.");
  const sourceNote = "实验室负责人于 2026-10-13 确认现有网站的名称、Logo、简介、办公地点和文化价值观可公开使用。";
  const assets = await request("/api/admin/v1/assets");
  let logo = assets.find(item => item.sourceNote === sourceNote && item.altZh === "SCALE Lab 标识");
  if (!logo) {
    const logoPath = path.resolve(__dirname, "../../visual-preview-20261013/assets/images/scale-lab-logo.png");
    const form = new FormData();
    form.append("file", new Blob([await fs.readFile(logoPath)], { type: "image/png" }), "scale-lab-logo.png");
    form.append("altZh", "SCALE Lab 标识");
    form.append("altEn", "SCALE Lab logo");
    form.append("credit", "SCALE Lab 现有网站标识");
    form.append("sourceNote", sourceNote);
    logo = await request("/api/admin/v1/assets", "POST", form, true);
  }
  if (logo.status !== "active") {
    await request(`/api/admin/v1/assets/${logo.id}/clearances`, "POST", {
      type: "copyright", allowed: true, evidenceNote: "实验室负责人于 2026-10-13 明确确认现有 Logo 可在实验室网站公开使用。"
    });
    await request(`/api/admin/v1/assets/${logo.id}/clearances`, "POST", {
      type: "people", allowed: true, evidenceNote: "该图片为实验室图形标识，不含可识别的人物。"
    });
    await request(`/api/admin/v1/assets/${logo.id}/activate`, "POST", {});
  }
  const draft = await request("/api/admin/v1/settings/draft", "PUT", {
    expectedVersion: current.globalVersion, locale: "zh", name: "智能学习分析与评价实验室",
    shortName: "SCALE Lab", intro: "SCALE Lab（智能学习分析与评价实验室）由王志锋教授负责，聚焦教育数据挖掘、多模态课堂分析，以及教育人工智能理论与实证研究。",
    tagline: "以智能学习分析与评价，理解真实学习情境中的行为、认知与反馈。",
    department: "人工智能教育学部", university: "华中师范大学", location: "南湖综合楼 N7018",
    contactEmail: "", logoAssetId: logo.id,
    featured: { newsSlugs: [], directionSlugs: [], publicationSlugs: [] }, stats: [],
    sourceNote
  });
  await request("/api/admin/v1/settings/check", "POST", { locale: "zh", expectedVersion: draft.version });
  await request("/api/admin/v1/settings/publish", "POST", { locale: "zh", expectedVersion: draft.version });
  const published = await request("/api/v1/settings?locale=zh");
  if (published.name !== "智能学习分析与评价实验室" || published.logo?.id !== logo.id || published.contactEmail || published.stats.length) {
    throw new Error("Published settings differ from the confirmed baseline.");
  }
  const english = await request("/api/v1/settings?locale=en");
  if (english !== null) throw new Error("English settings should remain unpublished pending translation review.");
  console.log(JSON.stringify({ published: true, revisionId: draft.revisionId, logoAssetId: logo.id, locale: "zh", englishPublished: false }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
