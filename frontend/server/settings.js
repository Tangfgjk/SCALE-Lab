"use strict";

const express = require("express");
const { pool, transaction } = require("./db/pool");
const { requireUser, requireCsrf } = require("./auth");
const media = require("./media");

const admin = express.Router(), publicApi = express.Router();
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const send = (req, res, data, meta = null) => res.json({ data, meta, requestId: req.requestId });
const clean = (value, max) => String(value ?? "").trim().slice(0, max + 1);
const localeOf = req => req.query.locale === "en" ? "en" : "zh";
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const featuredTypes = { newsSlugs: "news", directionSlugs: "direction", publicationSlugs: "publication" };

function input(body) {
  const value = {
    locale: body.locale || "zh", name: clean(body.name, 150), shortName: clean(body.shortName, 80),
    intro: clean(body.intro, 3000), tagline: clean(body.tagline, 500), department: clean(body.department, 200),
    university: clean(body.university, 200), location: clean(body.location, 300), contactEmail: clean(body.contactEmail, 320),
    heroTitleBefore: clean(body.heroTitleBefore, 300), heroHighlight: clean(body.heroHighlight, 150),
    heroTitleAfter: clean(body.heroTitleAfter, 150), cultureTitle: clean(body.cultureTitle, 200),
    cultureVision: clean(body.cultureVision, 1000), cultureValues: body.cultureValues || [],
    logoAssetId: clean(body.logoAssetId, 36) || null, featured: body.featured || {}, stats: body.stats || [],
    sourceUrl: clean(body.sourceUrl, 2000), sourceNote: clean(body.sourceNote, 2000)
  };
  if (!["zh", "en"].includes(value.locale)) throw fail(400, "INVALID_LOCALE", "语言无效");
  if (!value.name || value.name.length > 150 || !value.shortName || value.shortName.length > 80 || !value.intro || value.intro.length > 3000 ||
    value.tagline.length > 500 || value.department.length > 200 || value.university.length > 200 || value.location.length > 300) throw fail(400, "INVALID_SETTINGS", "请填写实验室名称、简称和简介，并检查长度");
  if (value.contactEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contactEmail) || value.contactEmail.length > 320)) throw fail(400, "INVALID_EMAIL", "联系邮箱格式无效");
  if (value.logoAssetId && !uuid.test(value.logoAssetId)) throw fail(400, "INVALID_LOGO", "Logo 须选媒体库图片");
  if (value.heroTitleBefore.length > 300 || value.heroHighlight.length > 150 || value.heroTitleAfter.length > 150 ||
    value.cultureTitle.length > 200 || value.cultureVision.length > 1000 ||
    (!!value.heroTitleBefore !== !!value.heroHighlight)) throw fail(400, "INVALID_EDITORIAL", "首页标题须同时填写主文案与强调文字，并检查长度");
  if (!Array.isArray(value.cultureValues) || value.cultureValues.length > 6 || value.cultureValues.some(item =>
    !item || typeof item !== "object" || !clean(item.title, 100) || !clean(item.text, 800) ||
    clean(item.title, 100).length > 100 || clean(item.text, 800).length > 800)) throw fail(400, "INVALID_CULTURE", "价值观最多 6 项，每项须填写标题和说明");
  value.cultureValues = value.cultureValues.map(item => ({ title: clean(item.title, 100), text: clean(item.text, 800) }));
  if ((!value.sourceUrl && !value.sourceNote) || (value.sourceUrl && (!/^https?:\/\//i.test(value.sourceUrl) || value.sourceUrl.length > 2000)) || value.sourceNote.length > 2000) throw fail(400, "SOURCE_REQUIRED", "请填写站点资料来源");
  if (!value.featured || typeof value.featured !== "object" || Array.isArray(value.featured)) throw fail(400, "INVALID_FEATURED", "首页精选格式无效");
  value.featured = Object.fromEntries(Object.keys(featuredTypes).map(key => {
    const items = value.featured[key] || [];
    if (!Array.isArray(items) || items.length > 5 || items.some(item => typeof item !== "string" || !slug.test(item)) || new Set(items).size !== items.length) throw fail(400, "INVALID_FEATURED", "精选内容最多 5 条，且不能重复");
    return [key, items];
  }));
  if (!Array.isArray(value.stats) || value.stats.length > 6 || value.stats.some(item =>
    !item || typeof item !== "object" || !/^[0-9]+(?:\.[0-9]+)?\+?$/.test(String(item.value ?? "")) ||
    !clean(item.label, 100) || clean(item.label, 100).length > 100 || clean(item.unit, 20).length > 20 ||
    !clean(item.sourceNote, 500) || clean(item.sourceNote, 500).length > 500)) throw fail(400, "INVALID_STATS", "每项统计都须有数值、名称和可追溯来源，最多 6 项");
  value.stats = value.stats.map(item => ({ value: String(item.value), unit: clean(item.unit, 20), label: clean(item.label, 100), sourceNote: clean(item.sourceNote, 500) }));
  return value;
}
async function latest(client, locale, published = false) {
  const join = published ? "JOIN site_setting_publications p ON p.revision_id=r.id AND p.key=r.key AND p.locale=$1" : "";
  return (await client.query(`SELECT r.id AS "revisionId",r.version,r.locale,r.name,r.short_name AS "shortName",r.intro,r.tagline,r.department,r.university,r.location,
    r.contact_email AS "contactEmail",r.logo_asset_id AS "logoAssetId",r.featured,r.stats,r.source_url AS "sourceUrl",r.source_note AS "sourceNote",
    r.hero_title_before AS "heroTitleBefore",r.hero_highlight AS "heroHighlight",r.hero_title_after AS "heroTitleAfter",
    r.culture_title AS "cultureTitle",r.culture_vision AS "cultureVision",r.culture_values AS "cultureValues",
    r.review_state AS "reviewState",r.checked_at AS "checkedAt",r.created_at AS "createdAt"
    FROM site_setting_revisions r ${join} WHERE r.key='main' AND r.locale=$1 ORDER BY r.version DESC LIMIT 1`, [locale])).rows[0] || null;
}
function sharedFacts(row) {
  return { contactEmail: row.contactEmail || "", logoAssetId: row.logoAssetId || null, featured: row.featured,
    stats: row.stats.map(item => ({ value: item.value, sourceNote: item.sourceNote })) };
}
function sameFacts(a, b) { return JSON.stringify(sharedFacts(a)) === JSON.stringify(sharedFacts(b)); }
async function validateReferences(client, row) {
  if (row.logoAssetId && !await media.activeAsset(client, row.logoAssetId)) throw fail(409, "LOGO_NOT_CLEARED", "Logo 图片尚未获准公开或已停用");
  for (const [key, type] of Object.entries(featuredTypes)) {
    const slugs = row.featured[key] || [];
    if (!slugs.length) continue;
    const result = await client.query(`SELECT i.slug FROM content_items i JOIN content_publications p ON p.content_id=i.id AND p.locale=$3
      WHERE i.type=$1 AND i.slug=ANY($2::text[])`, [type, slugs, row.locale]);
    if (result.rowCount !== slugs.length) throw fail(409, "FEATURED_NOT_PUBLISHED", "精选内容须先在当前语言发布");
  }
}
async function lockSettings(client, version) {
  const settings = (await client.query("SELECT * FROM site_settings WHERE key='main' FOR UPDATE")).rows[0];
  if (!Number.isInteger(version) || version !== settings.version) throw fail(409, "VERSION_CONFLICT", "站点设置已更新，请刷新后重试");
  return settings;
}
async function audit(client, actor, action, revisionId, detail = {}) {
  await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,$2,$3)", [actor, action, JSON.stringify({ settingRevisionId: revisionId, ...detail })]);
}

admin.use(requireUser);
admin.get("/", wrap(async (req, res) => {
  const locale = localeOf(req);
  const settings = (await pool.query("SELECT version FROM site_settings WHERE key='main'")).rows[0];
  const row = await latest(pool, locale);
  const chinese = row || await latest(pool, "zh");
  const result = row || { version: settings.version, locale, name: "", shortName: chinese?.shortName || "", intro: "", tagline: "", department: "", university: "", location: "",
    heroTitleBefore: "", heroHighlight: "", heroTitleAfter: "", cultureTitle: "", cultureVision: "", cultureValues: [],
    contactEmail: chinese?.contactEmail || "", logoAssetId: chinese?.logoAssetId || null, featured: chinese?.featured || { newsSlugs: [], directionSlugs: [], publicationSlugs: [] },
    stats: [], sourceUrl: "", sourceNote: "", reviewState: "unverified", checkedAt: null, revisionId: null };
  result.globalVersion = settings.version;
  const publication = await latest(pool, locale, true);
  result.published = !!publication;
  result.currentPublished = !!publication && publication.revisionId === result.revisionId;
  send(req, res, result);
}));
admin.get("/revisions", wrap(async (req, res) => {
  const result = await pool.query(`SELECT r.id,r.version,r.locale,r.name,r.review_state AS "reviewState",r.created_at AS "createdAt",
    EXISTS(SELECT 1 FROM site_setting_publications p WHERE p.revision_id=r.id) AS published
    FROM site_setting_revisions r WHERE r.key='main' ORDER BY r.version DESC LIMIT 100`);
  send(req, res, result.rows);
}));
admin.get("/preview", wrap(async (req, res) => {
  const row = await latest(pool, localeOf(req));
  if (!row) throw fail(404, "NOT_FOUND", "该语言尚无站点设置草稿");
  send(req, res, row);
}));
admin.put("/draft", requireCsrf, wrap(async (req, res) => {
  const value = input(req.body);
  const result = await transaction(async client => {
    const settings = await lockSettings(client, req.body.expectedVersion);
    if (value.locale === "en" && !await latest(client, "zh")) throw fail(409, "CHINESE_REQUIRED", "请先创建中文站点设置");
    const version = settings.version + 1;
    const row = (await client.query(`INSERT INTO site_setting_revisions(key,version,locale,name,short_name,intro,tagline,department,university,location,contact_email,
      logo_asset_id,featured,stats,source_url,source_note,changed_by,hero_title_before,hero_highlight,hero_title_after,culture_title,culture_vision,culture_values)
      VALUES('main',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id`,
    [version, value.locale, value.name, value.shortName, value.intro, value.tagline, value.department, value.university, value.location,
      value.contactEmail, value.logoAssetId, JSON.stringify(value.featured), JSON.stringify(value.stats), value.sourceUrl || null, value.sourceNote || null, req.admin.id,
      value.heroTitleBefore, value.heroHighlight, value.heroTitleAfter, value.cultureTitle, value.cultureVision, JSON.stringify(value.cultureValues)])).rows[0];
    await client.query("UPDATE site_settings SET version=$1,updated_at=now() WHERE key='main'", [version]);
    await audit(client, req.admin.id, "settings.save", row.id, { locale: value.locale });
    return { revisionId: row.id, version, locale: value.locale, reviewState: "unverified" };
  });
  send(req, res, result);
}));
admin.post("/check", requireCsrf, wrap(async (req, res) => {
  const locale = req.body.locale || "zh";
  if (!["zh", "en"].includes(locale)) throw fail(400, "INVALID_LOCALE", "语言无效");
  const result = await transaction(async client => {
    await lockSettings(client, req.body.expectedVersion);
    const row = await latest(client, locale);
    if (!row) throw fail(409, "LOCALE_MISMATCH", "该语言尚无草稿");
    await validateReferences(client, row);
    await client.query("UPDATE site_setting_revisions SET review_state='ready',checked_by=$1,checked_at=now() WHERE id=$2", [req.admin.id, row.revisionId]);
    await audit(client, req.admin.id, "settings.check", row.revisionId, { locale });
    return { revisionId: row.revisionId, version: row.version, reviewState: "ready" };
  });
  send(req, res, result);
}));
admin.post("/publish", requireCsrf, wrap(async (req, res) => {
  const locale = req.body.locale || "zh";
  if (!["zh", "en"].includes(locale)) throw fail(400, "INVALID_LOCALE", "语言无效");
  const result = await transaction(async client => {
    await lockSettings(client, req.body.expectedVersion);
    const row = await latest(client, locale);
    if (!row) throw fail(409, "LOCALE_MISMATCH", "该语言尚无草稿");
    if (row.reviewState !== "ready" || !row.checkedAt) throw fail(409, "NOT_CHECKED", "请先核查当前修订");
    await validateReferences(client, row);
    if (locale === "en") {
      const chinese = await latest(client, "zh", true);
      if (!chinese) throw fail(409, "CHINESE_REQUIRED", "请先发布中文站点设置");
      if (!sameFacts(chinese, row)) throw fail(409, "SHARED_FACTS_CHANGED", "英文设置的联系邮箱、Logo、精选或统计事实与已发布中文不一致");
    }
    await client.query(`INSERT INTO site_setting_publications(key,locale,revision_id,published_by) VALUES('main',$1,$2,$3)
      ON CONFLICT(key,locale) DO UPDATE SET revision_id=excluded.revision_id,published_by=excluded.published_by,published_at=now()`, [locale, row.revisionId, req.admin.id]);
    if (locale === "zh") {
      const english = await latest(client, "en", true);
      if (english && !sameFacts(english, row)) {
        await client.query("DELETE FROM site_setting_publications WHERE key='main' AND locale='en'");
        await audit(client, req.admin.id, "settings.invalidate_en", english.revisionId);
      }
    }
    await audit(client, req.admin.id, "settings.publish", row.revisionId, { locale });
    return { revisionId: row.revisionId, version: row.version, locale, published: true };
  });
  send(req, res, result);
}));
admin.post("/withdraw", requireCsrf, wrap(async (req, res) => {
  const locale = req.body.locale || "zh";
  if (!["zh", "en"].includes(locale)) throw fail(400, "INVALID_LOCALE", "语言无效");
  const result = await transaction(async client => {
    await lockSettings(client, req.body.expectedVersion);
    const removed = await client.query("DELETE FROM site_setting_publications WHERE key='main' AND (locale=$1 OR ($1='zh' AND locale='en')) RETURNING locale,revision_id", [locale]);
    if (!removed.rowCount) throw fail(409, "NOT_PUBLISHED", "该语言尚未发布");
    await audit(client, req.admin.id, "settings.withdraw", removed.rows[0].revision_id, { locales: removed.rows.map(row => row.locale) });
    return { locale, published: false };
  });
  send(req, res, result);
}));

publicApi.get("/", wrap(async (req, res) => {
  const row = await latest(pool, localeOf(req), true);
  if (!row) return send(req, res, null);
  const logo = row.logoAssetId ? await media.activeAsset(pool, row.logoAssetId) : null;
  send(req, res, { name: row.name, shortName: row.shortName, intro: row.intro, tagline: row.tagline, department: row.department,
    university: row.university, location: row.location, contactEmail: row.contactEmail,
    logo: logo ? media.publicAsset(logo, localeOf(req)) : null, featured: row.featured, stats: row.stats,
    heroTitleBefore: row.heroTitleBefore, heroHighlight: row.heroHighlight, heroTitleAfter: row.heroTitleAfter,
    cultureTitle: row.cultureTitle, cultureVision: row.cultureVision, cultureValues: row.cultureValues });
}));

module.exports = { admin, publicApi };
