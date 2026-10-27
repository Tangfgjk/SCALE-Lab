"use strict";
// User requested text review first: upload pending media and save album drafts only.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const drafts = require("../seed-content/lab-activities-drafts-20261020.json");
const sources = require("../seed-media/lab-activities-20261020/sources.json");
const root = path.join(__dirname, "../seed-media/lab-activities-20261020");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3004";
let cookie = "", csrf = "";
async function request(endpoint, method = "GET", value) {
  assert(!/\/(activate|clearances|check|publish|withdraw|permissions)(?:\?|$)/.test(endpoint), "Draft-only import cannot approve or publish");
  const multipart = value instanceof FormData;
  const response = await fetch(base + endpoint, { method, headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}), ...(!multipart ? { "content-type": "application/json" } : {}) }, body: value === undefined ? undefined : multipart ? value : JSON.stringify(value) });
  if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
  const result = await response.json(); assert(response.ok, `${method} ${endpoint}: ${response.status} ${result.error?.message}`); return result;
}
const data = async (...args) => (await request(...args)).data;
async function main() {
  assert(process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD);
  for (const source of sources) assert.equal(crypto.createHash("sha256").update(await fs.readFile(path.join(root, source.file))).digest("hex"), source.preparedSha256);
  csrf = (await data("/api/admin/v1/session", "POST", { login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD })).csrfToken;
  const before = await data("/api/v1/activities?locale=zh");
  const libraries = await data("/api/admin/v1/assets/libraries"), library = libraries.find(l => l.name === "默认图片库") || libraries[0]; assert(library);
  let parent = library.folders.find(f => !f.parentId && f.name === "实验室活动");
  if (!parent) parent = await data("/api/admin/v1/assets/folders", "POST", { libraryId: library.id, name: "实验室活动" });
  const report = { executedAt: new Date().toISOString(), state: "drafts-and-pending-media-only", activities: [] };
  for (const draft of drafts) {
    const folderName = draft.activityDate + " " + (draft.slug.startsWith("graduation") ? "毕业合照" : "东湖团建");
    let folder = library.folders.find(f => f.parentId === parent.id && f.name === folderName);
    if (!folder) folder = await data("/api/admin/v1/assets/folders", "POST", { libraryId: library.id, parentId: parent.id, name: folderName });
    const existing = (await request(`/api/admin/v1/assets?folderId=${folder.id}&pageSize=100`)).data;
    const images = [];
    for (const [index, photo] of draft.photos.entries()) {
      const source = sources.find(s => s.file === photo.file); assert(source);
      const sourceNote = `用户2026-10-20提供活动照片；活动：${draft.title}；活动日期：${draft.activityDate}；原文件：${source.sourceEntry || "单独提供的烧烤图片"}；原件SHA256：${source.sourceSha256}；上传副本SHA256：${source.preparedSha256}；文稿及公开状态待用户审核，当前仅上传。`;
      let asset = existing.find(a => a.sourceNote === sourceNote || (a.sourceNote || "").includes(`原件SHA256：${source.sourceSha256}`));
      if (!asset) {
        const form = new FormData(); form.set("file", new Blob([await fs.readFile(path.join(root, photo.file))], { type: "image/jpeg" }), photo.file);
        form.set("folderId", folder.id); form.set("displayName", `${draft.activityDate} ${index + 1}. ${photo.caption}`);
        form.set("altZh", photo.caption); form.set("credit", "实验室提供"); form.set("sourceNote", sourceNote);
        asset = await data("/api/admin/v1/assets", "POST", form); existing.push({ ...asset, sourceNote });
      }
      const detail = await data(`/api/admin/v1/assets/${asset.id}`);
      assert.equal(detail.status, "pending", "Media already reviewed; do not modify an approved activity via this script");
      images.push({ assetId: asset.id, caption: photo.caption });
      assert.equal((await fetch(base + `/api/v1/assets/${asset.id}/file`)).status, 404, "Pending photo must not be public");
    }
    const { photos, activityDate, ...fields } = draft;
    const richText={type:"doc",schemaVersion:1,content:[
      ...draft.body.split(/\n\s*\n/).filter(Boolean).map(text=>({type:"paragraph",content:[{type:"text",text}]})),
      ...images.map(image=>({type:"image",attrs:{...image,width:"large",align:"center"}}))
    ]};
    const payload={...fields,category:"activity",happenedAt:activityDate,coverAssetId:images[0]?.assetId || null,richText};
    const listed = await data("/api/admin/v1/news?q=" + encodeURIComponent(draft.slug));
    let item = listed.find(i => i.slug === draft.slug);
    if (!item) item = await data("/api/admin/v1/news", "POST", payload);
    const saved = await data(`/api/admin/v1/news/${item.id}?locale=zh`);
    for (const key of ["title", "summary", "body", "happenedAt", "location", "sourceNote"]) assert.equal(saved[key], payload[key], `User edited ${key}; refusing to overwrite`);
    assert.deepEqual(saved.richText.content.filter(n=>n.type==="image").map(n=>({assetId:n.attrs.assetId,caption:n.attrs.caption})), images);
    assert.equal(saved.reviewState, "unverified"); assert.equal(saved.published, false);
    report.activities.push({ id: item.id, slug: draft.slug, title: draft.title, version: saved.version, folderId: folder.id,
      activityDate: draft.activityDate, reviewState: saved.reviewState, published: saved.published, images });
    console.log(`Draft: ${draft.activityDate} ${draft.title}; ${images.length} pending images`);
  }
  assert.deepEqual(await data("/api/v1/activities?locale=zh"), before);
  const file = path.join(__dirname, "../storage/import-reports/lab-activity-drafts-20261020.json"); await fs.writeFile(file, JSON.stringify(report, null, 2) + "\n");
  console.log("Public albums unchanged. Report:", file);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
