"use strict";

const express = require("express");
const { pool, transaction } = require("./db/pool");
const { requireUser, requireCsrf } = require("./auth");
const { richTextOf, plainTextOf, imageIds, uuid } = require("./rich-text");
const { activeAssets, publicAsset } = require("./media");

const admin = express.Router();
const publicApi = express.Router();
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const response = (req, res, data, meta = null) => res.json({ data, meta, requestId: req.requestId });
const localeOf = req => req.query.locale === "en" ? "en" : "zh";

function input(body, creating = false) {
  const slug = String(body.slug || "").trim().toLowerCase();
  const locale = String(body.locale || "zh");
  const title = String(body.title || "").trim();
  const summary = String(body.summary || "").trim();
  const text = String(body.body || "").trim();
  const richText = richTextOf(body.richText, text);
  const coverAssetId = body.coverAssetId || null;
  if (coverAssetId && !uuid.test(coverAssetId)) throw fail(400,"INVALID_ASSET","封面必须是媒体库图片");
  const normalizedBody = richText ? plainTextOf(richText) : text;
  const happenedAt = String(body.happenedAt || "").trim();
  const category = String(body.category || "news").trim();
  const sourceUrl = String(body.sourceUrl || "").trim();
  const sourceNote = String(body.sourceNote || "").trim();
  if (creating && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw fail(400, "INVALID_SLUG", "标识只能使用英文小写、数字和连字符");
  if (!["zh", "en"].includes(locale)) throw fail(400, "INVALID_LOCALE", "语言只能是 zh 或 en");
  if (!title || title.length > 200 || !summary || summary.length > 500 || !normalizedBody || normalizedBody.length > 30000) throw fail(400, "INVALID_CONTENT", "请填写标题、摘要和正文，并检查长度");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(happenedAt) || Number.isNaN(Date.parse(`${happenedAt}T00:00:00Z`))) throw fail(400, "INVALID_DATE", "请填写有效的事件日期");
  if (!category || category.length > 50) throw fail(400, "INVALID_CATEGORY", "分类无效");
  if (sourceUrl && (!/^https?:\/\//i.test(sourceUrl) || sourceUrl.length > 2000)) throw fail(400, "INVALID_SOURCE_URL", "来源链接必须是 http(s) 地址");
  if (sourceNote.length > 2000) throw fail(400, "INVALID_SOURCE_NOTE", "来源说明过长");
  return { slug, locale, title, summary, body: normalizedBody, richText, coverAssetId, happenedAt, category, sourceUrl, sourceNote };
}

async function assertMedia(client, ids, publish = false) {
  ids=[...new Set(ids)].sort();
  if(!ids.length) return;
  const found=await client.query("SELECT id FROM assets WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [ids]);
  if(found.rowCount!==ids.length) throw fail(400,"ASSET_MISSING","引用的图片不存在");
  if(publish) {
    const active=await activeAssets(client,ids);
    const missing=ids.filter(id=>!active.some(a=>a.id===id));
    if(missing.length) throw fail(409,"ASSET_NOT_PUBLIC","以下图片未启用、已归档或授权不完整："+missing.join("、"));
  }
}
async function revisionMedia(client, row, locale, adminView = false) {
  const ids=[...new Set([...imageIds(row.extra_json?.richText),row.cover_asset_id].filter(Boolean))];
  const assets=await activeAssets(client,ids);
  const media=Object.fromEntries(assets.map(a=>[a.id,publicAsset(a,locale)]));
  if(adminView && ids.length) {
    const all=await client.query('SELECT id,display_name AS "displayName",alt_zh AS "altZh",alt_en AS "altEn",credit FROM assets WHERE id=ANY($1::uuid[])',[ids]);
    all.rows.forEach(a=>{ media[a.id]={...a,alt:locale==="en" ? a.altEn || a.altZh : a.altZh,url:`/api/admin/v1/assets/${a.id}/file`,available:!!media[a.id]}; });
  }
  return {media,coverAssetId:row.cover_asset_id || null,cover:media[row.cover_asset_id] || null};
}
async function checkRevisionMedia(client,row) {
  const refs=await client.query("SELECT asset_id FROM news_revision_assets WHERE revision_id=$1",[row.revision_id]);
  await assertMedia(client,refs.rows.map(r=>r.asset_id),true);
}
async function addRevision(client, item, data, actor) {
  const bodyIds=imageIds(data.richText);
  await assertMedia(client,[...bodyIds,data.coverAssetId].filter(Boolean));
  const version = item.version + 1;
  const revision = (await client.query(
    "INSERT INTO content_revisions(content_id,version,changed_by) VALUES($1,$2,$3) RETURNING id,created_at",
    [item.id, version, actor]
  )).rows[0];
  await client.query(
    "INSERT INTO content_localizations(revision_id,locale,title,summary,body,extra_json) VALUES($1,$2,$3,$4,$5,$6)",
    [revision.id, data.locale, data.title, data.summary, data.body, JSON.stringify(data.richText ? { richText: data.richText } : {})]
  );
  await client.query("INSERT INTO news_revisions(revision_id,category,happened_at,cover_asset_id) VALUES($1,$2,$3,$4)", [revision.id, data.category, data.happenedAt,data.coverAssetId]);
  for (const [position,id] of bodyIds.entries()) await client.query("INSERT INTO news_revision_assets(revision_id,asset_id,purpose,position) VALUES($1,$2,'body',$3)",[revision.id,id,position]);
  if(data.coverAssetId) await client.query("INSERT INTO news_revision_assets(revision_id,asset_id,purpose,position) VALUES($1,$2,'cover',0)",[revision.id,data.coverAssetId]);
  if (data.sourceUrl || data.sourceNote) {
    await client.query("INSERT INTO content_sources(revision_id,source_url,source_note) VALUES($1,$2,$3)", [revision.id, data.sourceUrl || null, data.sourceNote || null]);
  }
  await client.query("UPDATE content_items SET current_revision_id=$1,version=$2,updated_by=$3,updated_at=now() WHERE id=$4", [revision.id, version, actor, item.id]);
  await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,'news.save',$2,$3,$4)", [actor, item.id, revision.id,JSON.stringify({coverAssetId:data.coverAssetId,bodyAssetIds:bodyIds})]);
  return { id: item.id, slug: item.slug, version, revisionId: revision.id, locale: data.locale, reviewState: "unverified" };
}

async function lockedItem(client, id) {
  const item = (await client.query("SELECT * FROM content_items WHERE id=$1 AND type='news' FOR UPDATE", [id])).rows[0];
  if (!item) throw fail(404, "NOT_FOUND", "新闻不存在");
  return item;
}
async function latestLocale(client, item, locale) {
  return (await client.query(`SELECT r.id AS revision_id,r.version,l.locale,l.title,l.summary,l.body,l.extra_json,l.review_state,
    n.category,n.cover_asset_id,to_char(n.happened_at,'YYYY-MM-DD') AS happened_at,s.source_url,s.source_note,s.checked_at
    FROM content_revisions r JOIN content_localizations l ON l.revision_id=r.id AND l.locale=$2
    JOIN news_revisions n ON n.revision_id=r.id LEFT JOIN content_sources s ON s.revision_id=r.id
    WHERE r.content_id=$1 ORDER BY r.version DESC LIMIT 1`, [item.id, locale])).rows[0] || null;
}
async function publishedFacts(client, item, locale) {
  return (await client.query(`SELECT p.revision_id,n.category,to_char(n.happened_at,'YYYY-MM-DD') AS happened_at
    FROM content_publications p JOIN news_revisions n ON n.revision_id=p.revision_id
    WHERE p.content_id=$1 AND p.locale=$2`, [item.id, locale])).rows[0] || null;
}
function sameFacts(a, b) { return a && b && a.category === b.category && a.happened_at === b.happened_at; }
async function assertChineseFirst(client, item, row) {
  const chinese = await publishedFacts(client, item, "zh");
  if (!chinese) throw fail(409, "CHINESE_REQUIRED", "请先发布中文版本");
  if (!sameFacts(chinese, row)) throw fail(409, "SHARED_FACTS_CHANGED", "英文事件日期或分类与已发布中文不一致，请核对后保存英文新草稿");
}
function versionOf(req, item) {
  if (!Number.isInteger(req.body.expectedVersion) || req.body.expectedVersion !== item.version) throw fail(409, "VERSION_CONFLICT", "内容已被其他操作修改，请刷新后重试");
}

admin.use(requireUser);
admin.get("/news", wrap(async (req, res) => {
  const q = String(req.query.q || "").trim();
  const state = req.query.state || "all", sort = req.query.sort || "updated";
  const page = Number(req.query.page || 1), pageSize = Number(req.query.pageSize || 100);
  if (!["all","draft","ready","published","changes"].includes(state) || !["updated","date"].includes(sort) ||
      !Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw fail(400,"INVALID_FILTER","新闻筛选或分页参数无效");
  const result = await pool.query(`WITH listing AS (
    SELECT i.id,i.slug,i.status,i.version,i.created_at,i.updated_at,
      l.title,l.summary,l.review_state,l.locale,to_char(n.happened_at,'YYYY-MM-DD') AS happened_at,
      p.revision_id IS NOT NULL AS published_zh,
      CASE WHEN p.revision_id=zh.id THEN 'published' WHEN p.revision_id IS NOT NULL THEN 'changes'
        WHEN l.review_state='ready' THEN 'ready' ELSE 'draft' END AS workflow_state
    FROM content_items i LEFT JOIN LATERAL (
      SELECT r.id FROM content_revisions r JOIN content_localizations lc ON lc.revision_id=r.id AND lc.locale='zh'
      WHERE r.content_id=i.id ORDER BY r.version DESC LIMIT 1
    ) zh ON true LEFT JOIN content_localizations l ON l.revision_id=zh.id AND l.locale='zh'
    LEFT JOIN news_revisions n ON n.revision_id=zh.id
    LEFT JOIN content_publications p ON p.content_id=i.id AND p.locale='zh'
    WHERE i.type='news' AND ($1='' OR i.slug ILIKE '%'||$1||'%' OR l.title ILIKE '%'||$1||'%')
  ), filtered AS (SELECT * FROM listing WHERE $2='all' OR workflow_state=$2),
  paged AS (SELECT * FROM filtered ORDER BY ${sort === "date" ? "happened_at" : "updated_at"} DESC NULLS LAST,id DESC LIMIT $3 OFFSET $4)
  SELECT (SELECT count(*)::int FROM filtered) AS total,
    COALESCE((SELECT json_agg(paged) FROM paged),'[]'::json) AS rows`, [q,state,pageSize,(page-1)*pageSize]);
  response(req, res, result.rows[0].rows, { total: result.rows[0].total, page, pageSize });
}));
admin.get("/news/:id", wrap(async (req, res) => {
  const item = (await pool.query("SELECT id,slug,status,version FROM content_items WHERE type='news' AND id=$1", [req.params.id])).rows[0];
  if (!item) throw fail(404, "NOT_FOUND", "新闻不存在");
  const locale = localeOf(req);
  const row = await latestLocale(pool, item, locale);
  const fallback = row || await latestLocale(pool, item, "zh");
  const publication = await publishedFacts(pool, item, locale);
  response(req, res, {
    id: item.id, slug: item.slug, status: item.status, version: item.version, locale,
    revisionId: row?.revision_id || null, title: row?.title || "", summary: row?.summary || "", body: row?.body || "",
    reviewState: row?.review_state || "unverified", category: fallback?.category || "news", happenedAt: fallback?.happened_at || "",
    richText: row?.extra_json?.richText || null, sourceUrl: row?.source_url || "", sourceNote: row?.source_note || "", checkedAt: row?.checked_at || null,
    ...await revisionMedia(pool,row || {},locale,true),
    published: !!publication, publishedRevisionId: publication?.revision_id || null,
    currentPublished: !!publication && publication.revision_id === row?.revision_id
  });
}));
admin.get("/news/:id/revisions", wrap(async (req, res) => {
  const result = await pool.query(`SELECT r.id,r.version,r.created_at,l.locale,l.title,l.review_state,
    EXISTS(SELECT 1 FROM content_publications p WHERE p.revision_id=r.id) AS published
    FROM content_revisions r JOIN content_items i ON i.id=r.content_id
    JOIN content_localizations l ON l.revision_id=r.id WHERE i.type='news' AND i.id=$1 ORDER BY r.version DESC`, [req.params.id]);
  response(req, res, result.rows);
}));
admin.get("/news/:id/preview", wrap(async (req, res) => {
  const item = (await pool.query("SELECT id,slug,version FROM content_items WHERE type='news' AND id=$1", [req.params.id])).rows[0];
  if (!item) throw fail(404, "NOT_FOUND", "新闻不存在");
  const row = await latestLocale(pool, item, localeOf(req));
  if (!row) throw fail(404, "NOT_FOUND", "预览内容不存在");
  response(req, res, { slug: item.slug, version: row.version, locale: row.locale, title: row.title, summary: row.summary, body: row.body, richText: row.extra_json?.richText || null, category: row.category, happenedAt: row.happened_at,...await revisionMedia(pool,row,row.locale,true) });
}));
admin.post("/news", requireCsrf, wrap(async (req, res) => {
  const data = input(req.body, true);
  if (data.locale !== "zh") throw fail(409, "CHINESE_REQUIRED", "请先创建中文新闻，再录入英文草稿");
  const saved = await transaction(async client => {
    const item = (await client.query("INSERT INTO content_items(type,slug,created_by,updated_by) VALUES('news',$1,$2,$2) RETURNING *", [data.slug, req.admin.id])).rows[0];
    return addRevision(client, item, data, req.admin.id);
  });
  response(req, res.status(201), saved);
}));
admin.put("/news/:id/draft", requireCsrf, wrap(async (req, res) => {
  const data = input(req.body);
  const saved = await transaction(async client => {
    const item = await lockedItem(client, req.params.id);
    versionOf(req, item);
    if (data.locale === "en" && !await latestLocale(client, item, "zh")) throw fail(409, "CHINESE_REQUIRED", "请先创建中文新闻");
    return addRevision(client, item, data, req.admin.id);
  });
  response(req, res, saved);
}));
admin.post("/news/:id/check", requireCsrf, wrap(async (req, res) => {
  const result = await transaction(async client => {
    const item = await lockedItem(client, req.params.id);
    versionOf(req, item);
    const locale = req.body.locale || "zh";
    const row = await latestLocale(client, item, locale);
    if (!row) throw fail(409, "LOCALE_MISMATCH", "该语言尚无草稿，请先保存");
    await checkRevisionMedia(client,row);
    await client.query("UPDATE content_localizations SET review_state='ready',reviewed_by=$1,reviewed_at=now() WHERE revision_id=$2 AND locale=$3", [req.admin.id, row.revision_id, locale]);
    await client.query("UPDATE content_sources SET checked_by=$1,checked_at=now() WHERE revision_id=$2", [req.admin.id, row.revision_id]);
    await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,'news.check',$2,$3,$4)", [req.admin.id, item.id, row.revision_id, JSON.stringify({ locale, sourceProvided: !!(row.source_url || row.source_note) })]);
    return { id: item.id, version: item.version, reviewState: "ready" };
  });
  response(req, res, result);
}));
admin.post("/news/:id/publish", requireCsrf, wrap(async (req, res) => {
  const result = await transaction(async client => {
    const item = await lockedItem(client, req.params.id);
    versionOf(req, item);
    const locale = req.body.locale || "zh";
    const row = await latestLocale(client, item, locale);
    if (!row) throw fail(409, "LOCALE_MISMATCH", "该语言尚无草稿，请先保存");
    if (row.review_state !== "ready") throw fail(409, "NOT_CHECKED", "请先核查当前修订");
    await checkRevisionMedia(client,row);
    if (locale === "en") await assertChineseFirst(client, item, row);
    await client.query(`INSERT INTO content_publications(content_id,locale,revision_id,published_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(content_id,locale) DO UPDATE SET revision_id=excluded.revision_id,published_by=excluded.published_by,published_at=now()`, [item.id, locale, row.revision_id, req.admin.id]);
    if (locale === "zh") {
      const english = await publishedFacts(client, item, "en");
      if (english && !sameFacts(english, row)) {
        await client.query("DELETE FROM content_publications WHERE content_id=$1 AND locale='en'", [item.id]);
        await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,'news.invalidate_en',$2,$3,$4)", [req.admin.id, item.id, english.revision_id, JSON.stringify({ reason: "shared facts changed" })]);
      }
    }
    await client.query("UPDATE content_items SET status='published',updated_at=now() WHERE id=$1", [item.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,'news.publish',$2,$3,$4)", [req.admin.id, item.id, row.revision_id, JSON.stringify({ locale })]);
    return { id: item.id, version: item.version, locale, published: true };
  });
  response(req, res, result);
}));
admin.post("/news/:id/withdraw", requireCsrf, wrap(async (req, res) => {
  const result = await transaction(async client => {
    const item = await lockedItem(client, req.params.id);
    versionOf(req, item);
    const locale = req.body.locale || "zh";
    const removed = await client.query("DELETE FROM content_publications WHERE content_id=$1 AND (locale=$2 OR ($2='zh' AND locale='en')) RETURNING locale,revision_id", [item.id, locale]);
    if (!removed.rowCount) throw fail(409, "NOT_PUBLISHED", "该语言尚未发布");
    const remaining = await client.query("SELECT 1 FROM content_publications WHERE content_id=$1", [item.id]);
    if (!remaining.rowCount) await client.query("UPDATE content_items SET status='draft',updated_at=now() WHERE id=$1", [item.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,content_id,revision_id,detail_json) VALUES($1,'news.withdraw',$2,$3,$4)", [req.admin.id, item.id, removed.rows.find(row => row.locale === locale)?.revision_id || removed.rows[0].revision_id, JSON.stringify({ locales: removed.rows.map(row => row.locale) })]);
    return { id: item.id, locale, published: false };
  });
  response(req, res, result);
}));
admin.get("/audit-events", wrap(async (req, res) => {
  const actorId = String(req.query.actorId || ""), action = String(req.query.action || ""), contentId = String(req.query.contentId || "");
  const from = String(req.query.from || ""), to = String(req.query.to || "");
  const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const validDate = value => !value || (datePattern.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value);
  if ((actorId && !idPattern.test(actorId)) || (contentId && !idPattern.test(contentId)) ||
    (action && !/^[a-z][a-z0-9._-]{0,79}$/.test(action)) || !validDate(from) || !validDate(to) || (from && to && from > to))
    throw Object.assign(new Error("筛选条件无效"), { status: 400, code: "INVALID_FILTER" });
  const result = await pool.query(`SELECT e.id,e.actor_id,e.action,e.content_id,e.revision_id,e.detail_json,e.created_at,
    u.display_name AS "actorName",i.provider_subject AS "actorLogin" FROM audit_events e
    LEFT JOIN admin_users u ON u.id=e.actor_id LEFT JOIN admin_identities i ON i.user_id=u.id AND i.provider='local'
    WHERE ($1::uuid IS NULL OR e.actor_id=$1) AND ($2::text IS NULL OR e.action=$2)
      AND ($3::uuid IS NULL OR e.content_id=$3) AND ($4::date IS NULL OR e.created_at >= ($4::date::timestamp AT TIME ZONE 'Asia/Shanghai'))
      AND ($5::date IS NULL OR e.created_at < (($5::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Shanghai'))
    ORDER BY e.created_at DESC LIMIT 100`, [actorId || null, action || null, contentId || null, from || null, to || null]);
  response(req, res, result.rows);
}));

publicApi.get("/news", wrap(async (req, res) => {
  const locale = localeOf(req);
  const result = await pool.query(`SELECT i.slug,l.title,l.summary,l.body,n.category,to_char(n.happened_at,'YYYY-MM-DD') AS "happenedAt",p.published_at AS "publishedAt"
    FROM content_publications p JOIN content_items i ON i.id=p.content_id
    JOIN content_localizations l ON l.revision_id=p.revision_id AND l.locale=p.locale
    JOIN news_revisions n ON n.revision_id=p.revision_id
    WHERE i.type='news' AND p.locale=$1 ORDER BY n.happened_at DESC,p.published_at DESC LIMIT 100`, [locale]);
  response(req, res, result.rows, { total: result.rowCount });
}));
publicApi.get("/news/:slug", wrap(async (req, res) => {
  const result = await pool.query(`SELECT i.slug,l.title,l.summary,l.body,l.extra_json,n.cover_asset_id,n.category,to_char(n.happened_at,'YYYY-MM-DD') AS "happenedAt",p.published_at AS "publishedAt"
    FROM content_publications p JOIN content_items i ON i.id=p.content_id
    JOIN content_localizations l ON l.revision_id=p.revision_id AND l.locale=p.locale
    JOIN news_revisions n ON n.revision_id=p.revision_id
    WHERE i.type='news' AND i.slug=$1 AND p.locale=$2`, [req.params.slug, localeOf(req)]);
  if (!result.rowCount) throw fail(404, "NOT_FOUND", "内容不存在或尚未发布");
  const row = result.rows[0]; row.richText = row.extra_json?.richText || null;
  Object.assign(row,await revisionMedia(pool,row,localeOf(req)));
  delete row.extra_json; delete row.cover_asset_id;
  res.set("Cache-Control","no-store");
  response(req, res, row);
}));

module.exports = { admin, publicApi };
