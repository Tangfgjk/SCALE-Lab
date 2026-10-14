"use strict";

const express = require("express");
const { pool, transaction } = require("./db/pool");
const { requireUser, requireCsrf } = require("./auth");

const admin = express.Router();
const publicApi = express.Router();
const kinds = {
  "research-directions": { type: "direction", table: "direction_revisions" },
  publications: { type: "publication", table: "publication_revisions" },
  projects: { type: "project", table: "project_revisions" }
};
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const send = (req, res, data, meta = null) => res.json({ data, meta, requestId: req.requestId });
const localeOf = req => req.query.locale === "en" ? "en" : "zh";
const text = (value, max = 2000) => String(value ?? "").trim().slice(0, max + 1);
const url = value => !value || (/^https?:\/\//i.test(value) && value.length <= 2000);
const validDate = value => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

function kindOf(req) {
  const kind = kinds[req.params.kind];
  if (!kind) throw fail(404, "NOT_FOUND", "内容类型不存在");
  return kind;
}
function validate(req, creating) {
  const kind = kindOf(req);
  const body = req.body || {};
  const slug = text(body.slug, 100).toLowerCase();
  const title = text(body.title, 300);
  const summary = text(body.summary, 1000);
  const contentBody = text(body.body, 30000);
  const sourceUrl = text(body.sourceUrl, 2000);
  const sourceNote = text(body.sourceNote, 2000);
  if (creating && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw fail(400, "INVALID_SLUG", "标识只能使用英文小写、数字和连字符");
  const locale = body.locale || "zh";
  if (!["zh", "en"].includes(locale)) throw fail(400, "INVALID_LOCALE", "语言只能是 zh 或 en");
  if (creating && locale !== "zh") throw fail(409, "CHINESE_REQUIRED", "请先创建中文内容");
  if (!title || title.length > 300 || (kind.type !== "direction" && !summary) || summary.length > 1000 || contentBody.length > 30000) throw fail(400, "INVALID_CONTENT", "请填写标题和必要摘要，并检查长度");
  if ((!sourceUrl && !sourceNote) || !url(sourceUrl) || sourceNote.length > 2000) throw fail(400, "SOURCE_REQUIRED", "请填写有效的事实来源链接或说明");
  const details = {};
  if (kind.type === "direction") {
    details.themeNumber = Number(body.themeNumber);
    details.participants = text(body.participants, 500);
    details.areas = body.areas;
    if (!Number.isInteger(details.themeNumber) || details.themeNumber < 1 || details.themeNumber > 3) throw fail(400, "INVALID_THEME", "已确认公开口径为 3 类，方向编号须为 1–3");
    if (details.participants.length > 500 || !Array.isArray(details.areas) || details.areas.length > 20 || details.areas.some(area => !area || typeof area.title !== "string" || !area.title.trim() || !Array.isArray(area.items) || area.items.some(item => typeof item !== "string" || !item.trim()))) throw fail(400, "INVALID_AREAS", "子主题须为标题和条目数组");
  } else if (kind.type === "publication") {
    details.year = Number(body.year);
    details.authors = text(body.authors, 2000);
    details.venue = text(body.venue, 500);
    details.stage = text(body.stage, 30);
    details.doi = text(body.doi, 300).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    details.externalUrl = text(body.externalUrl, 2000);
    details.badge = text(body.badge, 100);
    if (!Number.isInteger(details.year) || details.year < 1900 || details.year > 2100 || !details.authors || details.authors.length > 2000 || !details.venue || details.venue.length > 500) throw fail(400, "INVALID_PUBLICATION", "请填写年份、作者和刊物／会议");
    if (!["published", "accepted", "in_press", "preprint"].includes(details.stage)) throw fail(400, "INVALID_STAGE", "请选择明确的发表阶段");
    if (details.stage === "published" && details.year > new Date().getFullYear()) throw fail(400, "FUTURE_PUBLICATION", "未来年份的论文不能标记为已发表");
    if (details.doi && (!/^10\.\d{4,9}\/.+$/i.test(details.doi) || details.doi.length > 300)) throw fail(400, "INVALID_DOI", "DOI 格式无效");
    if (!url(details.externalUrl) || details.badge.length > 100) throw fail(400, "INVALID_LINK", "外链或标签无效");
  } else {
    details.grantCode = text(body.grantCode, 100);
    details.fundingType = text(body.fundingType, 300);
    details.role = text(body.role, 200);
    details.status = text(body.projectStatus, 30);
    details.startsOn = text(body.startsOn, 10);
    details.endsOn = text(body.endsOn, 10);
    if (!details.fundingType || details.fundingType.length > 300 || !details.role || details.role.length > 200 || details.grantCode.length > 100) throw fail(400, "INVALID_PROJECT", "请填写资助类别和负责人角色");
    if (!["planned", "ongoing", "completed"].includes(details.status)) throw fail(400, "INVALID_STATUS", "请选择明确的项目状态");
    if (!validDate(details.startsOn) || !validDate(details.endsOn) || (details.startsOn && details.endsOn && details.endsOn < details.startsOn)) throw fail(400, "INVALID_PERIOD", "项目日期或起止顺序无效");
  }
  return { kind, slug, locale, title, summary, body: contentBody, sourceUrl, sourceNote, details };
}

async function lockItem(client, id, type) {
  const item = (await client.query("SELECT * FROM content_items WHERE id=$1 AND type=$2 FOR UPDATE", [id, type])).rows[0];
  if (!item) throw fail(404, "NOT_FOUND", "内容不存在");
  return item;
}
function requireVersion(req, item) {
  if (!Number.isInteger(req.body?.expectedVersion) || req.body.expectedVersion !== item.version) throw fail(409, "VERSION_CONFLICT", "内容已更新，请刷新后重试");
}
async function saveRevision(client, item, data, actor) {
  const version = item.version + 1;
  const rev = (await client.query("INSERT INTO content_revisions(content_id,version,changed_by) VALUES($1,$2,$3) RETURNING id", [item.id, version, actor])).rows[0];
  await client.query("INSERT INTO content_localizations(revision_id,locale,title,summary,body) VALUES($1,$2,$3,$4,$5)", [rev.id, data.locale, data.title, data.summary, data.body]);
  await client.query("INSERT INTO content_sources(revision_id,source_url,source_note) VALUES($1,$2,$3)", [rev.id, data.sourceUrl || null, data.sourceNote || null]);
  const d = data.details;
  if (data.kind.type === "direction") await client.query("INSERT INTO direction_revisions(revision_id,theme_number,participants,areas) VALUES($1,$2,$3,$4)", [rev.id, d.themeNumber, d.participants, JSON.stringify(d.areas)]);
  if (data.kind.type === "publication") await client.query("INSERT INTO publication_revisions(revision_id,publication_year,authors,venue,publication_stage,doi,external_url,badge) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [rev.id, d.year, d.authors, d.venue, d.stage, d.doi || null, d.externalUrl || null, d.badge]);
  if (data.kind.type === "project") await client.query("INSERT INTO project_revisions(revision_id,grant_code,funding_type,project_role,project_status,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6,$7)", [rev.id, d.grantCode || null, d.fundingType, d.role, d.status, d.startsOn || null, d.endsOn || null]);
  await client.query("UPDATE content_items SET current_revision_id=$1,version=$2,updated_by=$3,updated_at=now() WHERE id=$4", [rev.id, version, actor, item.id]);
  await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id) VALUES($1,$2,$3,$4)", [actor, `${data.kind.type}.save`, item.id, rev.id]);
  return { id: item.id, slug: item.slug, version, revisionId: rev.id, locale: data.locale, reviewState: "unverified" };
}
function detailJoin(kind) {
  if (kind.type === "direction") return "d.theme_number AS \"themeNumber\",d.participants,d.areas";
  if (kind.type === "publication") return "d.publication_year AS year,d.authors,d.venue,d.publication_stage AS stage,d.doi,d.external_url AS \"externalUrl\",d.badge";
  return "d.grant_code AS \"grantCode\",d.funding_type AS \"fundingType\",d.project_role AS role,d.project_status AS \"projectStatus\",to_char(d.starts_on,'YYYY-MM-DD') AS \"startsOn\",to_char(d.ends_on,'YYYY-MM-DD') AS \"endsOn\"";
}
async function detail(client, kind, id, locale = "zh", published = false) {
  const revisionLink = published ? "JOIN content_publications p ON p.content_id=i.id AND p.locale=$3 JOIN content_revisions r ON r.id=p.revision_id" : "JOIN LATERAL (SELECT r.* FROM content_revisions r JOIN content_localizations lc ON lc.revision_id=r.id AND lc.locale=$3 WHERE r.content_id=i.id ORDER BY r.version DESC LIMIT 1) r ON true";
  const row = (await client.query(`SELECT i.id,i.slug,i.status,i.version,r.id AS "revisionId",l.title,l.summary,l.body,l.review_state AS "reviewState",s.source_url AS "sourceUrl",s.source_note AS "sourceNote",s.checked_at AS "checkedAt",${detailJoin(kind)}
    FROM content_items i ${revisionLink} JOIN content_localizations l ON l.revision_id=r.id AND l.locale=$3
    JOIN ${kind.table} d ON d.revision_id=r.id LEFT JOIN content_sources s ON s.revision_id=r.id
    WHERE i.type=$1 AND i.id=$2`, [kind.type, id, locale])).rows[0];
  return row;
}
async function publishedList(kind, locale = "zh") {
  const order = kind.type === "direction" ? "d.theme_number ASC" : kind.type === "publication" ? "d.publication_year DESC,p.published_at DESC" : "p.published_at DESC";
  return (await pool.query(`SELECT i.slug,l.title,l.summary,l.body,s.source_url AS "sourceUrl",${detailJoin(kind)} FROM content_items i
    JOIN content_publications p ON p.content_id=i.id AND p.locale=$2
    JOIN content_localizations l ON l.revision_id=p.revision_id AND l.locale=$2
    JOIN ${kind.table} d ON d.revision_id=p.revision_id
    LEFT JOIN content_sources s ON s.revision_id=p.revision_id WHERE i.type=$1 ORDER BY ${order} LIMIT 100`, [kind.type, locale])).rows;
}
function sharedFacts(kind, row) {
  if (kind.type === "direction") return { themeNumber: row.themeNumber };
  if (kind.type === "publication") return { year: row.year, stage: row.stage, doi: row.doi || "", externalUrl: row.externalUrl || "" };
  return { grantCode: row.grantCode || "", projectStatus: row.projectStatus, startsOn: row.startsOn || "", endsOn: row.endsOn || "" };
}
function sameFacts(kind, a, b) { return JSON.stringify(sharedFacts(kind, a)) === JSON.stringify(sharedFacts(kind, b)); }

admin.use(requireUser);
admin.get("/:kind", wrap(async (req, res) => {
  const kind = kindOf(req);
  const query = text(req.query.q, 100);
  const result = await pool.query(`SELECT i.id,i.slug,i.version,i.status,i.updated_at,l.title,l.review_state AS "reviewState",
    EXISTS(SELECT 1 FROM content_publications p WHERE p.content_id=i.id AND p.locale='zh') AS published
    FROM content_items i LEFT JOIN LATERAL (
      SELECT r.id FROM content_revisions r JOIN content_localizations lc ON lc.revision_id=r.id AND lc.locale='zh'
      WHERE r.content_id=i.id ORDER BY r.version DESC LIMIT 1
    ) zh ON true LEFT JOIN content_localizations l ON l.revision_id=zh.id AND l.locale='zh'
    WHERE i.type=$1 AND ($2='' OR i.slug ILIKE '%'||$2||'%' OR l.title ILIKE '%'||$2||'%') ORDER BY i.updated_at DESC LIMIT 100`, [kind.type, query]);
  send(req, res, result.rows, { total: result.rowCount });
}));
admin.post("/:kind", requireCsrf, wrap(async (req, res) => {
  const data = validate(req, true);
  const saved = await transaction(async client => {
    const item = (await client.query("INSERT INTO content_items(type,slug,created_by,updated_by) VALUES($1,$2,$3,$3) RETURNING *", [data.kind.type, data.slug, req.admin.id])).rows[0];
    return saveRevision(client, item, data, req.admin.id);
  });
  send(req, res.status(201), saved);
}));
admin.get("/:kind/:id", wrap(async (req, res) => {
  const kind = kindOf(req);
  const locale = localeOf(req);
  const row = await detail(pool, kind, req.params.id, locale);
  const chinese = row || await detail(pool, kind, req.params.id, "zh");
  if (!chinese) throw fail(404, "NOT_FOUND", "内容不存在");
  const result = row || { ...chinese, title: "", summary: "", body: "", reviewState: "unverified", sourceUrl: "", sourceNote: "", checkedAt: null, revisionId: null };
  result.locale = locale;
  result.published = (await pool.query("SELECT 1 FROM content_publications WHERE content_id=$1 AND locale=$2", [result.id, locale])).rowCount > 0;
  send(req, res, result);
}));
admin.get("/:kind/:id/revisions", wrap(async (req, res) => {
  const kind = kindOf(req);
  const result = await pool.query(`SELECT r.id,r.version,r.created_at,l.locale,l.title,l.review_state,
    EXISTS(SELECT 1 FROM content_publications p WHERE p.revision_id=r.id) AS published
    FROM content_revisions r JOIN content_items i ON i.id=r.content_id
    JOIN content_localizations l ON l.revision_id=r.id
    WHERE i.type=$1 AND i.id=$2 ORDER BY r.version DESC`, [kind.type, req.params.id]);
  send(req, res, result.rows);
}));
admin.get("/:kind/:id/preview", wrap(async (req, res) => {
  const row = await detail(pool, kindOf(req), req.params.id, localeOf(req));
  if (!row) throw fail(404, "NOT_FOUND", "内容不存在");
  send(req, res, row);
}));
admin.put("/:kind/:id/draft", requireCsrf, wrap(async (req, res) => {
  const data = validate(req, false);
  const saved = await transaction(async client => {
    const item = await lockItem(client, req.params.id, data.kind.type);
    requireVersion(req, item);
    if (data.locale === "en" && !await detail(client, data.kind, item.id, "zh")) throw fail(409, "CHINESE_REQUIRED", "请先创建中文内容");
    return saveRevision(client, item, data, req.admin.id);
  });
  send(req, res, saved);
}));
admin.post("/:kind/:id/check", requireCsrf, wrap(async (req, res) => {
  const kind = kindOf(req);
  const locale = req.body.locale || "zh";
  if (!["zh", "en"].includes(locale)) throw fail(400, "INVALID_LOCALE", "语言无效");
  const checked = await transaction(async client => {
    const item = await lockItem(client, req.params.id, kind.type);
    requireVersion(req, item);
    const row = await detail(client, kind, item.id, locale);
    if (!row) throw fail(409, "LOCALE_MISMATCH", "该语言尚无草稿，请先保存");
    if (!row.sourceUrl && !row.sourceNote) throw fail(409, "SOURCE_REQUIRED", "缺少事实来源");
    await client.query("UPDATE content_localizations SET review_state='ready',reviewed_by=$1,reviewed_at=now() WHERE revision_id=$2 AND locale=$3", [req.admin.id, row.revisionId, locale]);
    await client.query("UPDATE content_sources SET checked_by=$1,checked_at=now() WHERE revision_id=$2", [req.admin.id, row.revisionId]);
    await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,$2,$3,$4,$5)", [req.admin.id, `${kind.type}.check`, item.id, row.revisionId, JSON.stringify({ locale })]);
    return { id: item.id, version: item.version, reviewState: "ready" };
  });
  send(req, res, checked);
}));
admin.post("/:kind/:id/publish", requireCsrf, wrap(async (req, res) => {
  const kind = kindOf(req);
  const locale = req.body.locale || "zh";
  if (!["zh", "en"].includes(locale)) throw fail(400, "INVALID_LOCALE", "语言无效");
  const result = await transaction(async client => {
    const item = await lockItem(client, req.params.id, kind.type);
    requireVersion(req, item);
    const row = await detail(client, kind, item.id, locale);
    if (!row) throw fail(409, "LOCALE_MISMATCH", "该语言尚无草稿，请先保存");
    if (row.reviewState !== "ready" || !row.checkedAt) throw fail(409, "NOT_CHECKED", "请先核查当前修订的事实来源");
    if (locale === "en") {
      const chinese = await detail(client, kind, item.id, "zh", true);
      if (!chinese) throw fail(409, "CHINESE_REQUIRED", "请先发布中文版本");
      if (!sameFacts(kind, chinese, row)) throw fail(409, "SHARED_FACTS_CHANGED", "英文关键事实与已发布中文不一致，请核对后保存英文新草稿");
    }
    if (kind.type === "direction" && locale === "zh") {
      await client.query("SELECT pg_advisory_xact_lock(731028)");
      const existing = await client.query(`SELECT d.theme_number FROM content_publications p
        JOIN content_items i ON i.id=p.content_id JOIN direction_revisions d ON d.revision_id=p.revision_id
        WHERE i.type='direction' AND i.id<>$1 AND p.locale='zh'`, [item.id]);
      if (existing.rowCount >= 3 || existing.rows.some(other => other.theme_number === row.themeNumber)) throw fail(409, "DIRECTION_SLOT_TAKEN", "公开研究方向只允许编号 1–3 且不可重复");
    }
    if (kind.type === "publication" && row.doi) {
      await client.query("SELECT pg_advisory_xact_lock(731029,hashtext(lower($1)))", [row.doi]);
      const duplicate = await client.query(`SELECT i.id FROM content_publications p JOIN content_items i ON i.id=p.content_id
        JOIN publication_revisions d ON d.revision_id=p.revision_id
        WHERE i.type='publication' AND i.id<>$1 AND lower(d.doi)=lower($2) LIMIT 1`, [item.id, row.doi]);
      if (duplicate.rowCount) throw fail(409, "DUPLICATE_DOI", "该 DOI 已存在于另一篇已发布论文");
    }
    if (kind.type === "project" && row.grantCode) {
      await client.query("SELECT pg_advisory_xact_lock(731030,hashtext(lower($1)))", [row.grantCode]);
      const duplicate = await client.query(`SELECT i.id FROM content_publications p JOIN content_items i ON i.id=p.content_id
        JOIN project_revisions d ON d.revision_id=p.revision_id
        WHERE i.type='project' AND i.id<>$1 AND lower(d.grant_code)=lower($2) LIMIT 1`, [item.id, row.grantCode]);
      if (duplicate.rowCount) throw fail(409, "DUPLICATE_GRANT", "该项目编号已存在于另一条已发布项目");
    }
    await client.query(`INSERT INTO content_publications(content_id,locale,revision_id,published_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(content_id,locale) DO UPDATE SET revision_id=excluded.revision_id,published_by=excluded.published_by,published_at=now()`, [item.id, locale, row.revisionId, req.admin.id]);
    if (locale === "zh") {
      const english = await detail(client, kind, item.id, "en", true);
      if (english && !sameFacts(kind, english, row)) {
        await client.query("DELETE FROM content_publications WHERE content_id=$1 AND locale='en'", [item.id]);
        await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,$2,$3,$4,$5)", [req.admin.id, `${kind.type}.invalidate_en`, item.id, english.revisionId, JSON.stringify({ reason: "shared facts changed" })]);
      }
    }
    await client.query("UPDATE content_items SET status='published',updated_at=now() WHERE id=$1", [item.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,$2,$3,$4,$5)", [req.admin.id, `${kind.type}.publish`, item.id, row.revisionId, JSON.stringify({ locale })]);
    return { id: item.id, version: item.version, locale, published: true };
  });
  send(req, res, result);
}));
admin.post("/:kind/:id/withdraw", requireCsrf, wrap(async (req, res) => {
  const kind = kindOf(req);
  const locale = req.body.locale || "zh";
  if (!["zh", "en"].includes(locale)) throw fail(400, "INVALID_LOCALE", "语言无效");
  const result = await transaction(async client => {
    const item = await lockItem(client, req.params.id, kind.type);
    requireVersion(req, item);
    const removed = await client.query("DELETE FROM content_publications WHERE content_id=$1 AND (locale=$2 OR ($2='zh' AND locale='en')) RETURNING locale,revision_id", [item.id, locale]);
    if (!removed.rowCount) throw fail(409, "NOT_PUBLISHED", "内容尚未发布");
    const remaining = await client.query("SELECT 1 FROM content_publications WHERE content_id=$1", [item.id]);
    if (!remaining.rowCount) await client.query("UPDATE content_items SET status='draft',updated_at=now() WHERE id=$1", [item.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,$2,$3,$4,$5)", [req.admin.id, `${kind.type}.withdraw`, item.id, removed.rows.find(row => row.locale === locale)?.revision_id || removed.rows[0].revision_id, JSON.stringify({ locales: removed.rows.map(row => row.locale) })]);
    return { id: item.id, locale, published: false };
  });
  send(req, res, result);
}));

publicApi.get("/:kind", wrap(async (req, res) => {
  const kind = kindOf(req);
  const rows = await publishedList(kind, localeOf(req));
  send(req, res, rows, { total: rows.length });
}));
publicApi.get("/:kind/:slug", wrap(async (req, res) => {
  const kind = kindOf(req);
  const item = (await pool.query("SELECT id FROM content_items WHERE type=$1 AND slug=$2", [kind.type, req.params.slug])).rows[0];
  if (!item) throw fail(404, "NOT_FOUND", "内容不存在");
  const row = await detail(pool, kind, item.id, localeOf(req), true);
  if (!row) throw fail(404, "NOT_FOUND", "内容尚未发布");
  for (const key of ["id", "status", "version", "revisionId", "sourceUrl", "sourceNote", "checkedAt", "reviewState"]) delete row[key];
  send(req, res, row);
}));

module.exports = { admin, publicApi };
