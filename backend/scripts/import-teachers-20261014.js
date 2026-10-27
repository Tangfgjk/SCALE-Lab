"use strict";

// Curated faculty records and portraits from the official CCNU teacher pages.
// Binary source files are kept in seed-media so a fresh deployment can repeat this import.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
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
async function uploadPhoto(teacher, existingAssets) {
  const sourceNote = `华中师范大学教师主页肖像：${teacher.photoUrl}；2026-10-14 查阅，用户要求在本实验室网站展示教师照片。`;
  let asset = existingAssets.find(row => row.sourceNote === sourceNote);
  if (!asset) {
    const file = await fs.readFile(path.join(__dirname, "../seed-media", teacher.photoFile));
    const form = new FormData();
    form.set("file", new Blob([file], { type: teacher.photoFile.endsWith("png") ? "image/png" : "image/jpeg" }), teacher.photoFile);
    form.set("sourceNote", sourceNote);
    form.set("credit", "华中师范大学教师主页");
    form.set("altZh", `${teacher.nameZh}教师肖像`);
    form.set("altEn", `${teacher.nameEn} portrait`);
    const response = await fetch(base + "/api/admin/v1/assets", { method: "POST", headers: { cookie, "x-csrf-token": csrf }, body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(`Upload ${teacher.nameZh}: ${response.status} ${result.error?.code}`);
    asset = result.data;
    existingAssets.push({ ...asset, sourceNote });
  }
  const detail = await request(`/api/admin/v1/assets/${asset.id}`);
  const evidenceNote = `用户 2026-10-14 请求在实验室网站展示教师照片；原图来自 ${teacher.homepageUrl}，文件 ${teacher.photoUrl}。`;
  for (const type of ["copyright", "people"]) {
    if (!detail.clearances?.some(row => row.type === type && row.allowed)) {
      await request(`/api/admin/v1/assets/${asset.id}/clearances`, "POST", { type, allowed: true, evidenceNote });
    }
  }
  if (detail.status !== "active") await request(`/api/admin/v1/assets/${asset.id}/activate`, "POST");
  return asset.id;
}
async function upsertTeacher(teacher, photoAssetId) {
  const list = await request(`/api/admin/v1/members?q=${encodeURIComponent(teacher.slug)}`);
  const existing = list.find(row => row.slug === teacher.slug);
  const current = existing && await request(`/api/admin/v1/members/${existing.id}?locale=zh`);
  if (current && current.nameZh !== teacher.nameZh) throw new Error(`Existing slug conflict: ${teacher.slug}`);
  const data = current && teacher.slug === "wang-zhifeng"
    ? { ...current, photoAssetId, expectedVersion: current.version, locale: "zh" }
    : { locale: "zh", slug: teacher.slug, nameZh: teacher.nameZh, nameEn: teacher.nameEn,
      category: "researcher", role: "华中师范大学人工智能教育学部讲师", bio: teacher.bio,
      interests: teacher.interests, homepageUrl: teacher.homepageUrl, orcidUrl: "", githubUrl: "",
      publicEmail: "", destination: "", displayOrder: teacher.order, photoAssetId,
      sourceUrl: teacher.homepageUrl,
      sourceNote: `华中师范大学教师主页，2026-10-14 查阅；用户同日要求将该教师加入实验室网站。` };
  const unchanged = current?.published && current.photoAssetId === photoAssetId &&
    (teacher.slug === "wang-zhifeng" || current.bio === data.bio);
  if (unchanged && current.permissions?.photo?.permitted) return current.id;
  const saved = existing ? await request(`/api/admin/v1/members/${existing.id}/draft`, "PUT", data)
    : await request("/api/admin/v1/members", "POST", data);
  const evidenceNote = `用户 2026-10-14 要求加入 ${teacher.nameZh} 及教师照片；身份与肖像见 ${teacher.homepageUrl}。`;
  for (const field of ["profile", "bio", "photo"]) {
    if (!current?.permissions?.[field]?.permitted) await request(`/api/admin/v1/members/${saved.id}/permissions`, "POST", { field, permitted: true, evidenceNote });
  }
  await request(`/api/admin/v1/members/${saved.id}/check`, "POST", { locale: "zh", expectedVersion: saved.version });
  await request(`/api/admin/v1/members/${saved.id}/publish`, "POST", { locale: "zh", expectedVersion: saved.version });
  return saved.id;
}

const teachers = [
  { slug: "wang-zhifeng", nameZh: "王志锋", nameEn: "Zhifeng Wang", homepageUrl: "https://faculty.ccnu.edu.cn/wangzhifeng/zh_CN/index.htm",
    photoFile: "wang-zhifeng-source.png", photoUrl: "https://faculty.ccnu.edu.cn/_resource/fileshow/60c8151b-4d8e-4859-a453-47464d306d13.png" },
  { slug: "liu-xiaoxue", nameZh: "刘晓雪", nameEn: "Xiaoxue Liu", homepageUrl: "https://faculty.ccnu.edu.cn/liuxiaoxue/zh_CN/index.htm",
    photoFile: "liu-xiaoxue-source.jpg", photoUrl: "https://faculty.ccnu.edu.cn/_resource/fileshow/3d8d6fb6-af6b-4404-bdc6-184d7a11ed81.jpg", order: 1,
    bio: "华中师范大学人工智能教育学部讲师，澳大利亚伍伦贡大学计算机科学与技术博士。研究人工智能、学习分析、教育智能体与复杂网络分析。",
    interests: ["学习分析", "教育智能体", "复杂网络分析"] },
  { slug: "xiong-yuxuan", nameZh: "熊宇轩", nameEn: "Yuxuan Xiong", homepageUrl: "https://faculty.ccnu.edu.cn/xiongyuxuan/zh_CN/index.htm",
    photoFile: "xiong-yuxuan-source.jpg", photoUrl: "https://faculty.ccnu.edu.cn/_resource/fileshow/c00efef9-e56f-4732-954b-e05a9a7c07a4.jpg", order: 2,
    bio: "华中师范大学人工智能教育学部讲师，武汉大学计算机学院博士。研究涉及教育知识图谱、生成式人工智能、计算机视觉、数据集压缩与 AI 安全。",
    interests: ["教育知识图谱", "生成式人工智能", "计算机视觉"] }
];

async function main() {
  const session = await request("/api/admin/v1/session", "POST", { login, password }); csrf = session.csrfToken;
  const assets = await request("/api/admin/v1/assets");
  for (const teacher of teachers) {
    const photoAssetId = await uploadPhoto(teacher, assets);
    await upsertTeacher(teacher, photoAssetId);
  }
  const members = await request("/api/v1/members?locale=zh");
  for (const teacher of teachers) {
    const published = members.find(row => row.slug === teacher.slug);
    assert(published && published.photo.startsWith("/api/v1/assets/"), `Missing teacher photo: ${teacher.slug}`);
    assert.equal((await fetch(base + published.photo)).status, 200);
  }
  console.log(JSON.stringify({ members: members.length, advisor: members.filter(row => row.category === "advisor").length,
    researchers: members.filter(row => row.category === "researcher").length, photos: teachers.map(row => row.nameZh) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
