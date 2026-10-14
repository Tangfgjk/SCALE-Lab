"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const { pool, transaction } = require("./db/pool");
const { requireUser, requireCsrf } = require("./auth");

const admin = express.Router(), publicApi = express.Router();
const mediaRoot = path.resolve(process.env.MEDIA_ROOT || path.join(__dirname, "storage", "media"));
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const send = (req, res, data, meta = null) => res.json({ data, meta, requestId: req.requestId });
const clean = (value, max) => String(value ?? "").trim().slice(0, max + 1);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 8 } }).single("file");

function uploadOne(req, res, next) {
  upload(req, res, error => {
    if (!error) return next();
    next(fail(error.code === "LIMIT_FILE_SIZE" ? 413 : 400, error.code || "UPLOAD_INVALID", error.code === "LIMIT_FILE_SIZE" ? "图片不能超过 10 MB" : "上传请求无效"));
  });
}
function storagePath(key) {
  if (!/^\d{4}\/\d{2}\/[a-f0-9-]{36}\.webp$/.test(key)) throw fail(500, "STORAGE_KEY_INVALID", "媒体存储路径无效");
  return path.join(mediaRoot, ...key.split("/"));
}
async function activeAsset(client, id) {
  return (await client.query(`SELECT a.id,a.storage_key,a.mime_type,a.bytes,a.width,a.height,a.alt_zh AS "altZh",a.alt_en AS "altEn",a.credit,a.status
    FROM assets a WHERE a.id=$1 AND a.status='active'
      AND EXISTS (SELECT 1 FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='copyright' AND c.allowed=true)
      AND EXISTS (SELECT 1 FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='people' AND c.allowed=true)`, [id])).rows[0] || null;
}
async function activeAssets(client, ids) {
  if (!ids.length) return [];
  const result = await client.query(`SELECT a.id,a.alt_zh AS "altZh",a.alt_en AS "altEn",a.credit,a.width,a.height
    FROM assets a WHERE a.id=ANY($1::uuid[]) AND a.status='active'
      AND EXISTS (SELECT 1 FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='copyright' AND c.allowed=true)
      AND EXISTS (SELECT 1 FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='people' AND c.allowed=true)`, [ids]);
  return result.rows;
}
function publicAsset(row, locale = "zh") {
  return { id: row.id, url: `/api/v1/assets/${row.id}/file`, alt: locale === "en" ? row.altEn || row.altZh : row.altZh, credit: row.credit, width: row.width, height: row.height };
}

admin.use(requireUser);
admin.get("/", wrap(async (req, res) => {
  const result = await pool.query(`SELECT a.id,a.bytes,a.width,a.height,a.alt_zh AS "altZh",a.alt_en AS "altEn",a.credit,a.source_note AS "sourceNote",a.status,a.created_at AS "createdAt",
    COALESCE((SELECT c.allowed FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='copyright'),false) AS copyright,
    COALESCE((SELECT c.allowed FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='people'),false) AS people
    FROM assets a ORDER BY a.created_at DESC LIMIT 100`);
  send(req, res, result.rows, { total: result.rowCount });
}));
admin.post("/", requireCsrf, uploadOne, wrap(async (req, res) => {
  if (!req.file?.buffer) throw fail(400, "FILE_REQUIRED", "请选择图片");
  const sourceNote = clean(req.body.sourceNote, 2000), credit = clean(req.body.credit, 300);
  const altZh = clean(req.body.altZh, 500), altEn = clean(req.body.altEn, 500);
  if (!sourceNote || sourceNote.length > 2000 || credit.length > 300 || altZh.length > 500 || altEn.length > 500) throw fail(400, "INVALID_METADATA", "请填写图片来源，并检查说明长度");
  let metadata, output;
  try {
    metadata = await sharp(req.file.buffer, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format)) throw fail(400, "INVALID_IMAGE", "只接受 JPEG、PNG 或 WebP 图片");
    output = await sharp(req.file.buffer, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error.status) throw error;
    throw fail(400, "INVALID_IMAGE", "图片文件无法解码");
  }
  const now = new Date(), key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.webp`;
  const filePath = storagePath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, output.data, { flag: "wx" });
  try {
    const row = await transaction(async client => {
      const asset = (await client.query(`INSERT INTO assets(storage_key,mime_type,bytes,width,height,alt_zh,alt_en,credit,source_note,created_by)
        VALUES($1,'image/webp',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,status`,
      [key, output.data.length, output.info.width, output.info.height, altZh, altEn, credit, sourceNote, req.admin.id])).rows[0];
      await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'asset.upload',$2)", [req.admin.id, JSON.stringify({ assetId: asset.id })]);
      return asset;
    });
    send(req, res.status(201), { ...row, bytes: output.data.length, width: output.info.width, height: output.info.height });
  } catch (error) { await fs.unlink(filePath).catch(() => {}); throw error; }
}));
admin.get("/:id", wrap(async (req, res) => {
  const asset = (await pool.query(`SELECT id,bytes,width,height,alt_zh AS "altZh",alt_en AS "altEn",credit,source_note AS "sourceNote",status,created_at AS "createdAt" FROM assets WHERE id=$1`, [req.params.id])).rows[0];
  if (!asset) throw fail(404, "NOT_FOUND", "图片不存在");
  const clearances = (await pool.query(`SELECT clearance_type AS type,allowed,evidence_note AS "evidenceNote",changed_at AS "changedAt" FROM asset_clearances WHERE asset_id=$1`, [asset.id])).rows;
  send(req, res, { ...asset, clearances });
}));
admin.get("/:id/file", wrap(async (req, res) => {
  const row = (await pool.query("SELECT storage_key FROM assets WHERE id=$1", [req.params.id])).rows[0];
  if (!row) throw fail(404, "NOT_FOUND", "图片不存在");
  res.set("Cache-Control", "no-store");
  res.type("image/webp").sendFile(storagePath(row.storage_key));
}));
admin.put("/:id", requireCsrf, wrap(async (req, res) => {
  const altZh = clean(req.body.altZh, 500), altEn = clean(req.body.altEn, 500), credit = clean(req.body.credit, 300), sourceNote = clean(req.body.sourceNote, 2000);
  if (altZh.length > 500 || altEn.length > 500 || credit.length > 300 || !sourceNote || sourceNote.length > 2000) throw fail(400, "INVALID_METADATA", "请填写图片来源，并检查说明长度");
  const row = await transaction(async client => {
    const asset = (await client.query(`UPDATE assets SET alt_zh=$2,alt_en=$3,credit=$4,source_note=$5,updated_at=now() WHERE id=$1 RETURNING id,status`, [req.params.id, altZh, altEn, credit, sourceNote])).rows[0];
    if (!asset) throw fail(404, "NOT_FOUND", "图片不存在");
    if (asset.status === "active" && (!altZh || !credit)) await client.query("UPDATE assets SET status='pending' WHERE id=$1", [asset.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'asset.update',$2)", [req.admin.id, JSON.stringify({ assetId: asset.id })]);
    return asset;
  });
  send(req, res, row);
}));
admin.post("/:id/clearances", requireCsrf, wrap(async (req, res) => {
  const type = req.body.type, allowed = req.body.allowed, evidenceNote = clean(req.body.evidenceNote, 2000);
  if (!["copyright", "people"].includes(type) || typeof allowed !== "boolean" || evidenceNote.length > 2000 || (allowed && !evidenceNote)) throw fail(400, "INVALID_CLEARANCE", "请选择授权类型，并填写可追溯的依据");
  const row = await transaction(async client => {
    const asset = (await client.query("SELECT id,status FROM assets WHERE id=$1 FOR UPDATE", [req.params.id])).rows[0];
    if (!asset) throw fail(404, "NOT_FOUND", "图片不存在");
    await client.query(`INSERT INTO asset_clearances(asset_id,clearance_type,allowed,evidence_note,changed_by) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(asset_id,clearance_type) DO UPDATE SET allowed=excluded.allowed,evidence_note=excluded.evidence_note,changed_by=excluded.changed_by,changed_at=now()`, [asset.id, type, allowed, evidenceNote || null, req.admin.id]);
    if (!allowed && asset.status === "active") await client.query("UPDATE assets SET status='pending',updated_at=now() WHERE id=$1", [asset.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'asset.clearance',$2)", [req.admin.id, JSON.stringify({ assetId: asset.id, type, allowed })]);
    return { id: asset.id, type, allowed };
  });
  send(req, res, row);
}));
admin.post("/:id/activate", requireCsrf, wrap(async (req, res) => {
  const row = await transaction(async client => {
    const asset = (await client.query("SELECT * FROM assets WHERE id=$1 FOR UPDATE", [req.params.id])).rows[0];
    if (!asset) throw fail(404, "NOT_FOUND", "图片不存在");
    if (!asset.alt_zh || !asset.credit || !asset.source_note) throw fail(409, "METADATA_REQUIRED", "须填写中文替代文本、署名与来源");
    const clearances = await client.query("SELECT clearance_type FROM asset_clearances WHERE asset_id=$1 AND allowed=true", [asset.id]);
    if (!["copyright", "people"].every(type => clearances.rows.some(row => row.clearance_type === type))) throw fail(409, "CLEARANCE_REQUIRED", "须核对版权及人物公开授权；无可识别人物也须登记依据");
    await fs.access(storagePath(asset.storage_key));
    await client.query("UPDATE assets SET status='active',updated_at=now() WHERE id=$1", [asset.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'asset.activate',$2)", [req.admin.id, JSON.stringify({ assetId: asset.id })]);
    return { id: asset.id, status: "active" };
  });
  send(req, res, row);
}));
admin.post("/:id/disable", requireCsrf, wrap(async (req, res) => {
  const row = await transaction(async client => {
    const asset = (await client.query("UPDATE assets SET status='disabled',updated_at=now() WHERE id=$1 RETURNING id", [req.params.id])).rows[0];
    if (!asset) throw fail(404, "NOT_FOUND", "图片不存在");
    await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'asset.disable',$2)", [req.admin.id, JSON.stringify({ assetId: asset.id })]);
    return { id: asset.id, status: "disabled" };
  });
  send(req, res, row);
}));
admin.get("/:id/usages", wrap(async (req, res) => {
  const result = await pool.query(`SELECT i.id,i.type,i.slug,r.version,ca.display_order AS "displayOrder",p.locale AS "publishedLocale"
    FROM content_assets ca JOIN content_revisions r ON r.id=ca.revision_id JOIN content_items i ON i.id=r.content_id
    LEFT JOIN content_publications p ON p.revision_id=r.id WHERE ca.asset_id=$1
    UNION ALL
    SELECT i.id,i.type,i.slug,r.version,0 AS "displayOrder",p.locale AS "publishedLocale"
    FROM member_revisions m JOIN content_revisions r ON r.id=m.revision_id JOIN content_items i ON i.id=r.content_id
    LEFT JOIN content_publications p ON p.revision_id=r.id WHERE m.photo_asset_id=$1
    ORDER BY version DESC`, [req.params.id]);
  send(req, res, result.rows);
}));

publicApi.get("/:id/file", wrap(async (req, res) => {
  const row = await activeAsset(pool, req.params.id);
  if (!row) throw fail(404, "NOT_FOUND", "图片不存在或尚未获准公开");
  res.set("Cache-Control", "no-store");
  res.type("image/webp").sendFile(storagePath(row.storage_key));
}));

module.exports = { admin, publicApi, activeAsset, activeAssets, publicAsset, mediaRoot };
