"use strict";

const express = require("express");
const { listContent } = require("./content-list");
const { pool, transaction } = require("./db/pool");
const { requireUser, requireCsrf } = require("./auth");
const media = require("./media");

const admin = express.Router(), publicApi = express.Router();
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const send = (req, res, data, meta = null) => res.json({ data, meta, requestId: req.requestId });
const localeOf = req => req.query.locale === "en" ? "en" : "zh";
const clean = (value, max) => String(value ?? "").trim().slice(0, max + 1);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function input(body, creating = false) {
  const value = {
    slug: clean(body.slug, 100).toLowerCase(), locale: body.locale || "zh", title: clean(body.title, 200),
    summary: clean(body.summary, 1000), body: clean(body.body, 10000), activityDate: clean(body.activityDate, 10),
    location: clean(body.location, 300), sourceUrl: clean(body.sourceUrl, 2000), sourceNote: clean(body.sourceNote, 2000), images: body.images
  };
  if (creating && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)) throw fail(400, "INVALID_SLUG", "标识只能使用英文小写、数字和连字符");
  if (!["zh", "en"].includes(value.locale) || (creating && value.locale !== "zh")) throw fail(400, "INVALID_LOCALE", "请先创建中文相册");
  if (!value.title || value.title.length > 200 || !value.summary || value.summary.length > 1000 || value.body.length > 10000 || value.location.length > 300) throw fail(400, "INVALID_CONTENT", "请填写活动标题和简介，并检查长度");
  const parsed = new Date(`${value.activityDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.activityDate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.activityDate) throw fail(400, "INVALID_DATE", "活动日期无效");
  if ((!value.sourceUrl && !value.sourceNote) || (value.sourceUrl && !/^https?:\/\//i.test(value.sourceUrl)) || value.sourceUrl.length > 2000 || value.sourceNote.length > 2000) throw fail(400, "SOURCE_REQUIRED", "请填写活动来源链接或说明");
  if (!Array.isArray(value.images) || value.images.length > 30 || value.images.some(image => !uuid.test(image?.assetId || "") || typeof image.caption !== "string" || image.caption.length > 500)) throw fail(400, "INVALID_IMAGES", "图片列表最多 30 张，每张须选媒体库图片并填写简短说明");
  if (new Set(value.images.map(image => image.assetId)).size !== value.images.length) throw fail(400, "DUPLICATE_IMAGE", "同一相册不能重复选择图片");
  return value;
}
async function lockItem(client, id) {
  const item = (await client.query("SELECT * FROM content_items WHERE id=$1 AND type='activity' FOR UPDATE", [id])).rows[0];
  if (!item) throw fail(404, "NOT_FOUND", "相册不存在");
  return item;
}
function version(req, item) {
  if (!Number.isInteger(req.body.expectedVersion) || req.body.expectedVersion !== item.version) throw fail(409, "VERSION_CONFLICT", "相册已更新，请刷新后重试");
}
async function detail(client, id, locale = "zh", published = false) {
  const join = published ? "JOIN content_publications p ON p.content_id=i.id AND p.locale=$2 JOIN content_revisions r ON r.id=p.revision_id" :
    "JOIN LATERAL (SELECT r.* FROM content_revisions r JOIN content_localizations lc ON lc.revision_id=r.id AND lc.locale=$2 WHERE r.content_id=i.id ORDER BY r.version DESC LIMIT 1) r ON true";
  const row = (await client.query(`SELECT i.id,i.slug,i.version,i.status,r.id AS "revisionId",l.title,l.summary,l.body,l.review_state AS "reviewState",
    to_char(a.activity_date,'YYYY-MM-DD') AS "activityDate",a.location,s.source_url AS "sourceUrl",s.source_note AS "sourceNote",s.checked_at AS "checkedAt"
    FROM content_items i ${join} JOIN content_localizations l ON l.revision_id=r.id AND l.locale=$2
    JOIN activity_revisions a ON a.revision_id=r.id LEFT JOIN content_sources s ON s.revision_id=r.id
    WHERE i.id=$1 AND i.type='activity'`, [id, locale])).rows[0];
  if (!row) return null;
  const assets = await client.query(`SELECT ca.asset_id AS "assetId",ca.display_order AS "displayOrder",ca.caption_zh AS "captionZh",ca.caption_en AS "captionEn",
    a.status,a.alt_zh AS "altZh",a.alt_en AS "altEn" FROM content_assets ca JOIN assets a ON a.id=ca.asset_id
    WHERE ca.revision_id=$1 ORDER BY ca.display_order`, [row.revisionId]);
  row.images = assets.rows.map(asset => ({ assetId: asset.assetId, caption: locale === "en" ? asset.captionEn : asset.captionZh, status: asset.status, altZh: asset.altZh, altEn: asset.altEn }));
  return row;
}
async function save(client, item, value, actor) {
  const nextVersion = item.version + 1;
  const revision = (await client.query("INSERT INTO content_revisions(content_id,version,changed_by) VALUES($1,$2,$3) RETURNING id", [item.id, nextVersion, actor])).rows[0];
  await client.query("INSERT INTO content_localizations(revision_id,locale,title,summary,body) VALUES($1,$2,$3,$4,$5)", [revision.id, value.locale, value.title, value.summary, value.body]);
  await client.query("INSERT INTO activity_revisions(revision_id,activity_date,location) VALUES($1,$2,$3)", [revision.id, value.activityDate, value.location]);
  await client.query("INSERT INTO content_sources(revision_id,source_url,source_note) VALUES($1,$2,$3)", [revision.id, value.sourceUrl || null, value.sourceNote || null]);
  for (const [index, image] of value.images.entries()) {
    const exists = await client.query("SELECT 1 FROM assets WHERE id=$1", [image.assetId]);
    if (!exists.rowCount) throw fail(400, "ASSET_NOT_FOUND", "相册包含不存在的媒体图片");
    await client.query(`INSERT INTO content_assets(revision_id,asset_id,display_order,caption_zh,caption_en) VALUES($1,$2,$3,$4,$5)`,
      [revision.id, image.assetId, index, value.locale === "zh" ? image.caption.trim() : "", value.locale === "en" ? image.caption.trim() : ""]);
  }
  await client.query("UPDATE content_items SET current_revision_id=$1,version=$2,updated_by=$3,updated_at=now() WHERE id=$4", [revision.id, nextVersion, actor, item.id]);
  await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,'activity.save',$2,$3,$4)", [actor, item.id, revision.id, JSON.stringify({ locale: value.locale })]);
  return { id: item.id, version: nextVersion, revisionId: revision.id, locale: value.locale };
}
function sameFacts(a, b) {
  return a.activityDate === b.activityDate && a.images.map(image => image.assetId).join(",") === b.images.map(image => image.assetId).join(",");
}
async function requireReadyImages(client, row) {
  if (!row.images.length) throw fail(409, "IMAGES_REQUIRED", "至少添加一张已获准公开的图片");
  if (row.images.some(image => !image.caption?.trim())) throw fail(409, "CAPTION_REQUIRED", "每张图片都需要当前语言的说明");
  const active = await media.activeAssets(client, row.images.map(image => image.assetId));
  if (active.length !== row.images.length) throw fail(409, "IMAGE_NOT_CLEARED", "相册包含待核、停用或已撤销授权的图片");
}
async function publicShape(row, locale) {
  const active = await media.activeAssets(pool, row.images.map(image => image.assetId));
  const byId = new Map(active.map(asset => [asset.id, asset]));
  const images = row.images.filter(image => byId.has(image.assetId)).map(image => ({ ...media.publicAsset(byId.get(image.assetId), locale), caption: image.caption }));
  if (!images.length) return null;
  return { slug: row.slug, title: row.title, summary: row.summary, body: row.body, activityDate: row.activityDate, location: row.location, cover: images[0], images };
}

admin.use(requireUser);
admin.get("/", wrap(async (req, res) => {
  const result = await listContent("activity", req.query);
  send(req, res, result.data, result.meta);
}));
admin.post("/", requireCsrf, wrap(async (req, res) => {
  const value = input(req.body, true);
  const result = await transaction(async client => {
    const item = (await client.query("INSERT INTO content_items(type,slug,created_by,updated_by) VALUES('activity',$1,$2,$2) RETURNING *", [value.slug, req.admin.id])).rows[0];
    return save(client, item, value, req.admin.id);
  });
  send(req, res.status(201), result);
}));
admin.get("/:id", wrap(async (req, res) => {
  const locale = localeOf(req);
  const row = await detail(pool, req.params.id, locale);
  const chinese = row || await detail(pool, req.params.id, "zh");
  if (!chinese) throw fail(404, "NOT_FOUND", "相册不存在");
  const result = row || { ...chinese, title: "", summary: "", body: "", location: "", sourceUrl: "", sourceNote: "", checkedAt: null, reviewState: "unverified", revisionId: null,
    images: chinese.images.map(image => ({ ...image, caption: "" })) };
  result.locale = locale;
  result.published = (await pool.query("SELECT 1 FROM content_publications WHERE content_id=$1 AND locale=$2", [result.id, locale])).rowCount > 0;
  send(req, res, result);
}));
admin.get("/:id/revisions", wrap(async (req, res) => {
  const result = await pool.query(`SELECT r.id,r.version,r.created_at,l.locale,l.title,l.review_state,
    EXISTS(SELECT 1 FROM content_publications p WHERE p.revision_id=r.id) AS published
    FROM content_revisions r JOIN content_items i ON i.id=r.content_id JOIN content_localizations l ON l.revision_id=r.id
    WHERE i.type='activity' AND i.id=$1 ORDER BY r.version DESC`, [req.params.id]);
  send(req, res, result.rows);
}));
admin.get("/:id/preview", wrap(async (req, res) => {
  const row = await detail(pool, req.params.id, localeOf(req));
  if (!row) throw fail(404, "NOT_FOUND", "预览不存在");
  send(req, res, row);
}));
admin.put("/:id/draft", requireCsrf, wrap(async (req, res) => {
  const value = input(req.body);
  const result = await transaction(async client => {
    const item = await lockItem(client, req.params.id); version(req, item);
    if (value.locale === "en" && !await detail(client, item.id, "zh")) throw fail(409, "CHINESE_REQUIRED", "请先创建中文相册");
    return save(client, item, value, req.admin.id);
  });
  send(req, res, result);
}));
admin.post("/:id/check", requireCsrf, wrap(async (req, res) => {
  const locale = req.body.locale || "zh";
  if (!["zh", "en"].includes(locale)) throw fail(400, "INVALID_LOCALE", "语言无效");
  const result = await transaction(async client => {
    const item = await lockItem(client, req.params.id); version(req, item);
    const row = await detail(client, item.id, locale);
    if (!row) throw fail(409, "LOCALE_MISMATCH", "该语言尚无草稿");
    await requireReadyImages(client, row);
    await client.query("UPDATE content_localizations SET review_state='ready',reviewed_by=$1,reviewed_at=now() WHERE revision_id=$2 AND locale=$3", [req.admin.id, row.revisionId, locale]);
    await client.query("UPDATE content_sources SET checked_by=$1,checked_at=now() WHERE revision_id=$2", [req.admin.id, row.revisionId]);
    await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,'activity.check',$2,$3,$4)", [req.admin.id, item.id, row.revisionId, JSON.stringify({ locale })]);
    return { id: item.id, version: item.version, reviewState: "ready" };
  });
  send(req, res, result);
}));
admin.post("/:id/publish", requireCsrf, wrap(async (req, res) => {
  const locale = req.body.locale || "zh";
  if (!["zh", "en"].includes(locale)) throw fail(400, "INVALID_LOCALE", "语言无效");
  const result = await transaction(async client => {
    const item = await lockItem(client, req.params.id); version(req, item);
    const row = await detail(client, item.id, locale);
    if (!row) throw fail(409, "LOCALE_MISMATCH", "该语言尚无草稿");
    if (row.reviewState !== "ready" || !row.checkedAt) throw fail(409, "NOT_CHECKED", "请先核查当前修订");
    await requireReadyImages(client, row);
    if (locale === "en") {
      const chinese = await detail(client, item.id, "zh", true);
      if (!chinese) throw fail(409, "CHINESE_REQUIRED", "请先发布中文相册");
      if (!sameFacts(chinese, row)) throw fail(409, "SHARED_FACTS_CHANGED", "英文相册的活动日期或图片顺序与中文不一致");
    }
    await client.query(`INSERT INTO content_publications(content_id,locale,revision_id,published_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(content_id,locale) DO UPDATE SET revision_id=excluded.revision_id,published_by=excluded.published_by,published_at=now()`, [item.id, locale, row.revisionId, req.admin.id]);
    if (locale === "zh") {
      const english = await detail(client, item.id, "en", true);
      if (english && !sameFacts(english, row)) {
        await client.query("DELETE FROM content_publications WHERE content_id=$1 AND locale='en'", [item.id]);
        await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id) VALUES($1,'activity.invalidate_en',$2,$3)", [req.admin.id, item.id, english.revisionId]);
      }
    }
    await client.query("UPDATE content_items SET status='published',updated_at=now() WHERE id=$1", [item.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,'activity.publish',$2,$3,$4)", [req.admin.id, item.id, row.revisionId, JSON.stringify({ locale })]);
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
    if (!removed.rowCount) throw fail(409, "NOT_PUBLISHED", "相册尚未发布");
    const remaining = await client.query("SELECT 1 FROM content_publications WHERE content_id=$1", [item.id]);
    if (!remaining.rowCount) await client.query("UPDATE content_items SET status='draft',updated_at=now() WHERE id=$1", [item.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,'activity.withdraw',$2,$3,$4)", [req.admin.id, item.id, removed.rows[0].revision_id, JSON.stringify({ locales: removed.rows.map(row => row.locale) })]);
    return { id: item.id, locale, published: false };
  });
  send(req, res, result);
}));

publicApi.get("/", wrap(async (req, res) => {
  const locale = localeOf(req);
  const result = await pool.query("SELECT i.id FROM content_publications p JOIN content_items i ON i.id=p.content_id WHERE i.type='activity' AND p.locale=$1 ORDER BY p.published_at DESC LIMIT 100", [locale]);
  const rows = [];
  for (const item of result.rows) {
    const row = await publicShape(await detail(pool, item.id, locale, true), locale);
    if (row) rows.push(row);
  }
  send(req, res, rows, { total: rows.length });
}));
publicApi.get("/:slug", wrap(async (req, res) => {
  const item = (await pool.query("SELECT id FROM content_items WHERE type='activity' AND slug=$1", [req.params.slug])).rows[0];
  if (!item) throw fail(404, "NOT_FOUND", "相册不存在");
  const row = await detail(pool, item.id, localeOf(req), true);
  if (!row) throw fail(404, "NOT_FOUND", "相册尚未发布");
  const result = await publicShape(row, localeOf(req));
  if (!result) throw fail(404, "NOT_FOUND", "相册暂无获准公开的图片");
  send(req, res, result);
}));

module.exports = { admin, publicApi };
