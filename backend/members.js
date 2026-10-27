"use strict";

const express = require("express");
const { listContent } = require("./content-list");
const { pool, transaction } = require("./db/pool");
const { requireUser, requireCsrf } = require("./auth");
const { activeAsset, publicAsset } = require("./media");
const admin = express.Router(), publicApi = express.Router();
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const send = (req, res, data, meta = null) => res.json({ data, meta, requestId: req.requestId });
const localeOf = req => req.query.locale === "en" ? "en" : "zh";
const fields = ["profile", "bio", "email", "destination", "photo"];
const trim = (value, max) => String(value ?? "").trim().slice(0, max + 1);
const validUrl = value => !value || (/^https?:\/\//i.test(value) && value.length <= 2000);

function input(body, creating) {
  body = body || {};
  const value = {
    locale: body.locale || "zh",
    slug: trim(body.slug, 100).toLowerCase(), nameZh: trim(body.nameZh, 100), nameEn: trim(body.nameEn, 100),
    profileDetails: trim(body.profileDetails, 20000),
    category: trim(body.category, 30), role: trim(body.role, 200), bio: trim(body.bio, 10000),
    interests: body.interests, homepageUrl: trim(body.homepageUrl, 2000), orcidUrl: trim(body.orcidUrl, 2000),
    githubUrl: trim(body.githubUrl, 2000), publicEmail: trim(body.publicEmail, 320),
    destination: trim(body.destination, 500), photoAssetId: trim(body.photoAssetId, 36), sourceUrl: trim(body.sourceUrl, 2000), sourceNote: trim(body.sourceNote, 2000),
    displayOrder: Number(body.displayOrder ?? 0)
  };
  if (creating && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)) throw fail(400, "INVALID_SLUG", "标识只能使用英文小写、数字和连字符");
  if (!["zh", "en"].includes(value.locale)) throw fail(400, "INVALID_LOCALE", "语言只能是 zh 或 en");
  if (creating && value.locale !== "zh") throw fail(409, "CHINESE_REQUIRED", "请先创建中文成员档案");
  if (!value.nameZh || value.nameZh.length > 100 || value.nameEn.length > 100 || !value.role || value.role.length > 200 || value.bio.length > 10000) throw fail(400, "INVALID_MEMBER", "请填写姓名和角色，并检查长度");
  if (value.profileDetails.length > 20000) throw fail(400, "INVALID_DETAILS", "成员详情最多20000字");
  if (!["advisor", "researcher", "postdoc", "student", "alumni"].includes(value.category)) throw fail(400, "INVALID_CATEGORY", "成员类别无效");
  if (!Array.isArray(value.interests) || value.interests.length > 30 || value.interests.some(item => typeof item !== "string" || !item.trim() || item.length > 100)) throw fail(400, "INVALID_INTERESTS", "研究兴趣应为简短条目数组");
  if (![value.homepageUrl, value.orcidUrl, value.githubUrl, value.sourceUrl].every(validUrl)) throw fail(400, "INVALID_URL", "链接须为有效的 http(s) 地址");
  if (value.publicEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.publicEmail)) throw fail(400, "INVALID_EMAIL", "邮箱格式无效");
  if (value.publicEmail.length > 320 || value.destination.length > 500 || value.sourceNote.length > 2000 || (!value.sourceUrl && !value.sourceNote)) throw fail(400, "SOURCE_REQUIRED", "请填写资料来源，并检查字段长度");
  if (value.photoAssetId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.photoAssetId)) throw fail(400, "INVALID_ASSET", "成员照片须选择媒体库图片");
  if (!Number.isInteger(value.displayOrder) || value.displayOrder < 0 || value.displayOrder > 9999) throw fail(400, "INVALID_ORDER", "排序值须为 0–9999");
  return value;
}
async function lockItem(client, id) {
  const row = (await client.query("SELECT * FROM content_items WHERE id=$1 AND type='member' FOR UPDATE", [id])).rows[0];
  if (!row) throw fail(404, "NOT_FOUND", "成员不存在");
  return row;
}
function version(req, item) {
  if (!Number.isInteger(req.body?.expectedVersion) || req.body.expectedVersion !== item.version) throw fail(409, "VERSION_CONFLICT", "成员资料已更新，请刷新后重试");
}
async function saveRevision(client, item, value, actor) {
  const nextVersion = item.version + 1;
  const rev = (await client.query("INSERT INTO content_revisions(content_id,version,changed_by) VALUES($1,$2,$3) RETURNING id", [item.id, nextVersion, actor])).rows[0];
  await client.query("INSERT INTO content_localizations(revision_id,locale,title,summary,body,extra_json) VALUES($1,$2,$3,$4,$5,$6)", [rev.id, value.locale, value.nameZh, value.role, value.bio, JSON.stringify({profileDetails:value.profileDetails})]);
  await client.query(`INSERT INTO member_revisions(revision_id,category,name_en,member_role,interests,homepage_url,orcid_url,github_url,public_email,destination,display_order,photo_asset_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [rev.id, value.category, value.nameEn, value.role, JSON.stringify(value.interests), value.homepageUrl || null, value.orcidUrl || null, value.githubUrl || null, value.publicEmail || null, value.destination || null, value.displayOrder, value.photoAssetId || null]);
  await client.query("INSERT INTO content_sources(revision_id,source_url,source_note) VALUES($1,$2,$3)", [rev.id, value.sourceUrl || null, value.sourceNote || null]);
  await client.query("UPDATE content_items SET current_revision_id=$1,version=$2,updated_by=$3,updated_at=now() WHERE id=$4", [rev.id, nextVersion, actor, item.id]);
  await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id) VALUES($1,'member.save',$2,$3)", [actor, item.id, rev.id]);
  return { id: item.id, slug: item.slug, version: nextVersion, revisionId: rev.id, locale: value.locale, reviewState: "unverified" };
}
async function details(client, id, locale = "zh", published = false) {
  const revisionJoin = published ? "JOIN content_publications p ON p.content_id=i.id AND p.locale=$2 JOIN content_revisions r ON r.id=p.revision_id" : "JOIN LATERAL (SELECT r.* FROM content_revisions r JOIN content_localizations lc ON lc.revision_id=r.id AND lc.locale=$2 WHERE r.content_id=i.id ORDER BY r.version DESC LIMIT 1) r ON true";
  return (await client.query(`SELECT i.id,i.slug,i.status,i.version,r.id AS "revisionId",l.title AS "nameZh",l.body AS bio,COALESCE(l.extra_json->>'profileDetails','') AS "profileDetails",l.review_state AS "reviewState",
    m.category,m.name_en AS "nameEn",m.member_role AS role,m.interests,m.homepage_url AS "homepageUrl",m.orcid_url AS "orcidUrl",m.github_url AS "githubUrl",
    m.public_email AS "publicEmail",m.destination,m.display_order AS "displayOrder",m.photo_asset_id AS "photoAssetId",s.source_url AS "sourceUrl",s.source_note AS "sourceNote",s.checked_at AS "checkedAt"
    FROM content_items i ${revisionJoin} JOIN content_localizations l ON l.revision_id=r.id AND l.locale=$2
    JOIN member_revisions m ON m.revision_id=r.id LEFT JOIN content_sources s ON s.revision_id=r.id
    WHERE i.type='member' AND i.id=$1`, [id, locale])).rows[0];
}
function sharedFacts(row) {
  return { nameZh: row.nameZh, nameEn: row.nameEn || "", category: row.category,
    homepageUrl: row.homepageUrl || "", orcidUrl: row.orcidUrl || "", githubUrl: row.githubUrl || "",
    publicEmail: row.publicEmail || "", photoAssetId: row.photoAssetId || "", displayOrder: row.displayOrder };
}
function sameFacts(a, b) { return JSON.stringify(sharedFacts(a)) === JSON.stringify(sharedFacts(b)); }
async function permissions(client, id) {
  const result = await client.query("SELECT field,permitted,evidence_note AS \"evidenceNote\",changed_at AS \"changedAt\" FROM member_permissions WHERE content_id=$1", [id]);
  return Object.fromEntries(fields.map(field => [field, result.rows.find(row => row.field === field) || { field, permitted: false, evidenceNote: null }]));
}
admin.use(requireUser);
admin.get("/", wrap(async (req, res) => {
  const result = await listContent("member", req.query);
  send(req, res, result.data, result.meta);
}));
admin.post("/", requireCsrf, wrap(async (req, res) => {
  const value = input(req.body, true);
  const saved = await transaction(async client => {
    const item = (await client.query("INSERT INTO content_items(type,slug,created_by,updated_by) VALUES('member',$1,$2,$2) RETURNING *", [value.slug, req.admin.id])).rows[0];
    return saveRevision(client, item, value, req.admin.id);
  });
  send(req, res.status(201), saved);
}));
admin.get("/:id", wrap(async (req, res) => {
  const locale = localeOf(req);
  const row = await details(pool, req.params.id, locale);
  const chinese = row || await details(pool, req.params.id, "zh");
  if (!chinese) throw fail(404, "NOT_FOUND", "成员不存在");
  const result = row || { ...chinese, role: "", bio: "", profileDetails: "", interests: [], destination: "", sourceUrl: "", sourceNote: "", checkedAt: null, reviewState: "unverified", revisionId: null };
  result.locale = locale;
  result.permissions = await permissions(pool, result.id);
  result.published = (await pool.query("SELECT 1 FROM content_publications WHERE content_id=$1 AND locale=$2", [result.id, locale])).rowCount > 0;
  send(req, res, result);
}));
admin.get("/:id/revisions", wrap(async (req, res) => {
  const result = await pool.query(`SELECT r.id,r.version,r.created_at,l.locale,l.title,l.review_state,
    EXISTS(SELECT 1 FROM content_publications p WHERE p.revision_id=r.id) AS published
    FROM content_revisions r JOIN content_items i ON i.id=r.content_id JOIN content_localizations l ON l.revision_id=r.id
    WHERE i.type='member' AND i.id=$1 ORDER BY r.version DESC`, [req.params.id]);
  send(req, res, result.rows);
}));
admin.put("/:id/draft", requireCsrf, wrap(async (req, res) => {
  const value = input(req.body, false);
  const saved = await transaction(async client => {
    const item = await lockItem(client, req.params.id); version(req, item);
    if (value.locale === "en" && !await details(client, item.id, "zh")) throw fail(409, "CHINESE_REQUIRED", "请先创建中文成员档案");
    return saveRevision(client, item, value, req.admin.id);
  });
  send(req, res, saved);
}));
admin.post("/:id/permissions", requireCsrf, wrap(async (req, res) => {
  const field = trim(req.body?.field, 30);
  const permitted = req.body?.permitted;
  const evidenceNote = trim(req.body?.evidenceNote, 2000);
  if (!fields.includes(field) || typeof permitted !== "boolean" || evidenceNote.length > 2000 || (permitted && !evidenceNote)) throw fail(400, "INVALID_PERMISSION", "请选择字段并记录授权依据");
  const result = await transaction(async client => {
    const item = await lockItem(client, req.params.id);
    if (field === "photo" && permitted) {
      const row = await details(client, item.id, "zh");
      if (!row?.photoAssetId || !await activeAsset(client, row.photoAssetId)) throw fail(409, "PHOTO_ASSET_REQUIRED", "请先选择并启用已获版权与人物授权的媒体库照片");
    }
    await client.query(`INSERT INTO member_permissions(content_id,field,permitted,evidence_note,changed_by) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(content_id,field) DO UPDATE SET permitted=excluded.permitted,evidence_note=excluded.evidence_note,changed_by=excluded.changed_by,changed_at=now()`, [item.id, field, permitted, evidenceNote || null, req.admin.id]);
    if (field === "profile" && !permitted) {
      await client.query("DELETE FROM content_publications WHERE content_id=$1", [item.id]);
      await client.query("UPDATE content_items SET status='draft' WHERE id=$1", [item.id]);
    }
    await client.query("INSERT INTO audit_events(actor_id,action,content_id,detail_json) VALUES($1,'member.permission',$2,$3)", [req.admin.id, item.id, JSON.stringify({ field, permitted })]);
    return { field, permitted, permissions: await permissions(client, item.id) };
  });
  send(req, res, result);
}));
admin.post("/:id/check", requireCsrf, wrap(async (req, res) => {
  const locale = req.body.locale || "zh";
  if (!["zh", "en"].includes(locale)) throw fail(400, "INVALID_LOCALE", "语言无效");
  const result = await transaction(async client => {
    const item = await lockItem(client, req.params.id); version(req, item);
    const row = await details(client, item.id, locale);
    if (!row) throw fail(409, "LOCALE_MISMATCH", "该语言尚无草稿，请先保存");
    const permission = await permissions(client, item.id);
    if (!permission.profile.permitted) throw fail(409, "PROFILE_NOT_AUTHORIZED", "须先登记成员档案公开授权");
    if (!row.sourceUrl && !row.sourceNote) throw fail(409, "SOURCE_REQUIRED", "缺少资料来源");
    if (row.photoAssetId && !await activeAsset(client, row.photoAssetId)) throw fail(409, "PHOTO_ASSET_NOT_ACTIVE", "成员照片未启用或授权已撤销");
    await client.query("UPDATE content_localizations SET review_state='ready',reviewed_by=$1,reviewed_at=now() WHERE revision_id=$2 AND locale=$3", [req.admin.id, row.revisionId, locale]);
    await client.query("UPDATE content_sources SET checked_by=$1,checked_at=now() WHERE revision_id=$2", [req.admin.id, row.revisionId]);
    await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,'member.check',$2,$3,$4)", [req.admin.id, item.id, row.revisionId, JSON.stringify({ locale })]);
    return { id: item.id, version: item.version, reviewState: "ready" };
  });
  send(req, res, result);
}));
admin.post("/:id/publish", requireCsrf, wrap(async (req, res) => {
  const locale = req.body.locale || "zh";
  if (!["zh", "en"].includes(locale)) throw fail(400, "INVALID_LOCALE", "语言无效");
  const result = await transaction(async client => {
    const item = await lockItem(client, req.params.id); version(req, item);
    const row = await details(client, item.id, locale); const permission = await permissions(client, item.id);
    if (!row) throw fail(409, "LOCALE_MISMATCH", "该语言尚无草稿，请先保存");
    if (!permission.profile.permitted) throw fail(409, "PROFILE_NOT_AUTHORIZED", "成员档案尚未获得公开授权");
    if (row.reviewState !== "ready" || !row.checkedAt) throw fail(409, "NOT_CHECKED", "请先核查当前修订");
    if (row.photoAssetId && !await activeAsset(client, row.photoAssetId)) throw fail(409, "PHOTO_ASSET_NOT_ACTIVE", "成员照片未启用或授权已撤销");
    if (locale === "en") {
      const chinese = await details(client, item.id, "zh", true);
      if (!chinese) throw fail(409, "CHINESE_REQUIRED", "请先发布中文档案");
      if (!sameFacts(chinese, row)) throw fail(409, "SHARED_FACTS_CHANGED", "英文档案的身份与联系信息和已发布中文不一致，请核对后保存新草稿");
    }
    await client.query(`INSERT INTO content_publications(content_id,locale,revision_id,published_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(content_id,locale) DO UPDATE SET revision_id=excluded.revision_id,published_by=excluded.published_by,published_at=now()`, [item.id, locale, row.revisionId, req.admin.id]);
    if (locale === "zh") {
      const english = await details(client, item.id, "en", true);
      if (english && !sameFacts(english, row)) {
        await client.query("DELETE FROM content_publications WHERE content_id=$1 AND locale='en'", [item.id]);
        await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,'member.invalidate_en',$2,$3,$4)", [req.admin.id, item.id, english.revisionId, JSON.stringify({ reason: "shared facts changed" })]);
      }
    }
    await client.query("UPDATE content_items SET status='published' WHERE id=$1", [item.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,'member.publish',$2,$3,$4)", [req.admin.id, item.id, row.revisionId, JSON.stringify({ locale })]);
    return { id: item.id, version: item.version, locale, published: true };
  });
  send(req, res, result);
}));
admin.post("/:id/withdraw", requireCsrf, wrap(async (req, res) => {
  const locale = req.body.locale || "zh";
  if (!["zh", "en"].includes(locale)) throw fail(400, "INVALID_LOCALE", "语言无效");
  const result = await transaction(async client => {
    const item = await lockItem(client, req.params.id); version(req, item);
    const removed = await client.query("DELETE FROM content_publications WHERE content_id=$1 AND (locale=$2 OR ($2='zh' AND locale='en')) RETURNING locale,revision_id", [item.id, locale]);
    if (!removed.rowCount) throw fail(409, "NOT_PUBLISHED", "成员尚未发布");
    const remaining = await client.query("SELECT 1 FROM content_publications WHERE content_id=$1", [item.id]);
    if (!remaining.rowCount) await client.query("UPDATE content_items SET status='draft' WHERE id=$1", [item.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,'member.withdraw',$2,$3,$4)", [req.admin.id, item.id, removed.rows.find(row => row.locale === locale)?.revision_id || removed.rows[0].revision_id, JSON.stringify({ locales: removed.rows.map(row => row.locale) })]);
    return { id: item.id, locale, published: false };
  });
  send(req, res, result);
}));

const {readMembers}=require("./modules/members/public");
publicApi.get("/", wrap(async (req, res) => {
  const rows = await readMembers(pool,localeOf(req));
  send(req, res, rows, { total: rows.length });
}));
publicApi.get("/:slug", wrap(async (req, res) => {
  const [row] = await readMembers(pool,localeOf(req),{slug:req.params.slug,includeDetails:true});
  if (!row) throw fail(404, "NOT_FOUND", "成员不存在或未获公开授权");
  send(req, res, row);
}));
module.exports = { admin, publicApi };
