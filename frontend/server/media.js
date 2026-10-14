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
    FROM assets a WHERE a.id=$1 AND a.status='active' AND NOT a.archived
      AND EXISTS (SELECT 1 FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='copyright' AND c.allowed=true)
      AND EXISTS (SELECT 1 FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='people' AND c.allowed=true)`, [id])).rows[0] || null;
}
async function activeAssets(client, ids) {
  if (!ids.length) return [];
  const result = await client.query(`SELECT a.id,a.alt_zh AS "altZh",a.alt_en AS "altEn",a.credit,a.width,a.height
    FROM assets a WHERE a.id=ANY($1::uuid[]) AND a.status='active' AND NOT a.archived
      AND EXISTS (SELECT 1 FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='copyright' AND c.allowed=true)
      AND EXISTS (SELECT 1 FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='people' AND c.allowed=true)`, [ids]);
  return result.rows;
}
function publicAsset(row, locale = "zh") {
  return { id: row.id, url: `/api/v1/assets/${row.id}/file`, alt: locale === "en" ? row.altEn || row.altZh : row.altZh, credit: row.credit, width: row.width, height: row.height };
}
async function ensureDefaultLibrary(client, actor) {
  await client.query("SELECT pg_advisory_xact_lock(731028)");
  let library = (await client.query("SELECT id,name FROM media_libraries WHERE name='默认图片库'")).rows[0];
  if (!library) library = (await client.query("INSERT INTO media_libraries(name,created_by) VALUES('默认图片库',$1) RETURNING id,name", [actor])).rows[0];
  let folder = (await client.query("SELECT id,name FROM media_folders WHERE library_id=$1 AND parent_id IS NULL AND name='未分类'", [library.id])).rows[0];
  if (!folder) folder = (await client.query("INSERT INTO media_folders(library_id,name,created_by) VALUES($1,'未分类',$2) RETURNING id,name", [library.id, actor])).rows[0];
  return { library, folder };
}
async function validFolder(client, id) {
  if (!id) return null;
  const folder = (await client.query("SELECT id,library_id,parent_id,name FROM media_folders WHERE id=$1", [id])).rows[0];
  if (!folder) throw fail(400, "INVALID_FOLDER", "目标文件夹不存在");
  return folder;
}

admin.use(requireUser);
admin.get("/libraries", wrap(async (req, res) => {
  const result = await pool.query(`SELECT l.id,l.name,l.created_at AS "createdAt",f.id AS "folderId",f.parent_id AS "parentId",f.name AS "folderName"
    FROM media_libraries l LEFT JOIN media_folders f ON f.library_id=l.id ORDER BY l.name,f.parent_id NULLS FIRST,f.name`);
  const libraries = [];
  result.rows.forEach(row => {
    let library = libraries.find(item => item.id === row.id);
    if (!library) { library = { id: row.id, name: row.name, folders: [] }; libraries.push(library); }
    if (row.folderId) library.folders.push({ id: row.folderId, parentId: row.parentId, name: row.folderName });
  });
  send(req, res, libraries);
}));
admin.post("/libraries", requireCsrf, wrap(async (req, res) => {
  const name = clean(req.body.name, 100);
  if (!name || name.length > 100) throw fail(400, "INVALID_LIBRARY", "媒体库名称须为 1–100 字");
  const row = await transaction(async client => {
    const library = (await client.query("INSERT INTO media_libraries(name,created_by) VALUES($1,$2) RETURNING id,name", [name, req.admin.id])).rows[0];
    await client.query("INSERT INTO media_folders(library_id,name,created_by) VALUES($1,'未分类',$2)", [library.id, req.admin.id]);
    await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'media.library.create',$2)", [req.admin.id, JSON.stringify(library)]);
    return library;
  });
  send(req, res.status(201), row);
}));
admin.post("/folders", requireCsrf, wrap(async (req, res) => {
  const name = clean(req.body.name, 100), libraryId = req.body.libraryId, parentId = req.body.parentId || null;
  if (!name || name.length > 100 || !libraryId) throw fail(400, "INVALID_FOLDER", "文件夹名称须为 1–100 字，并选择所属媒体库");
  const row = await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(731028)");
    const library = (await client.query("SELECT id FROM media_libraries WHERE id=$1", [libraryId])).rows[0];
    if (!library) throw fail(400, "INVALID_LIBRARY", "所属媒体库不存在");
    if (parentId) {
      const parent = await validFolder(client, parentId);
      if (parent.library_id !== library.id) throw fail(400, "INVALID_FOLDER", "父文件夹必须属于同一媒体库");
    }
    const folder = (await client.query("INSERT INTO media_folders(library_id,parent_id,name,created_by) VALUES($1,$2,$3,$4) RETURNING id,library_id AS \"libraryId\",parent_id AS \"parentId\",name", [library.id, parentId, name, req.admin.id])).rows[0];
    await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'media.folder.create',$2)", [req.admin.id, JSON.stringify(folder)]);
    return folder;
  });
  send(req, res.status(201), row);
}));
admin.patch("/folders/:id", requireCsrf, wrap(async (req, res) => {
  const name = clean(req.body.name, 100), parentId = req.body.parentId === undefined ? undefined : (req.body.parentId || null);
  if ((req.body.name !== undefined && (!name || name.length > 100)) || (!name && parentId === undefined)) throw fail(400, "INVALID_FOLDER", "文件夹名称须为 1–100 字");
  const row = await transaction(async client => {
    // Serialize hierarchy edits, including simultaneous A→B and B→A moves.
    await client.query("SELECT pg_advisory_xact_lock(731028)");
    const folder = (await client.query("SELECT id,library_id FROM media_folders WHERE id=$1 FOR UPDATE", [req.params.id])).rows[0];
    if (!folder) throw fail(404, "NOT_FOUND", "文件夹不存在");
    if (parentId) {
      if (parentId === folder.id) throw fail(400, "INVALID_FOLDER", "文件夹不能成为自己的父级");
      const parent = await validFolder(client, parentId);
      if (parent.library_id !== folder.library_id) throw fail(400, "INVALID_FOLDER", "父文件夹必须属于同一媒体库");
      const descendants = await client.query(`WITH RECURSIVE subtree AS (
        SELECT id FROM media_folders WHERE id=$1 UNION ALL
        SELECT f.id FROM media_folders f JOIN subtree s ON f.parent_id=s.id
      ) SELECT id FROM subtree WHERE id=$2`, [folder.id, parentId]);
      if (descendants.rowCount) throw fail(400, "FOLDER_CYCLE", "不能移动到自己的子文件夹");
    }
    const changed = (await client.query("UPDATE media_folders SET name=COALESCE(NULLIF($2,''),name),parent_id=CASE WHEN $4 THEN $3::uuid ELSE parent_id END,updated_at=now() WHERE id=$1 RETURNING id,library_id AS \"libraryId\",parent_id AS \"parentId\",name", [folder.id, name, parentId ?? null, parentId !== undefined])).rows[0];
    await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'media.folder.update',$2)", [req.admin.id, JSON.stringify(changed)]);
    return changed;
  });
  send(req, res, row);
}));
admin.get("/", wrap(async (req, res) => {
  const q = clean(req.query.q, 200), folderId = req.query.folderId || null, status = req.query.status || null;
  const page = Number(req.query.page || 1), pageSize = Number(req.query.pageSize || 100);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
    (status && !["pending","active","disabled"].includes(status)) || q.length > 200)
    throw fail(400, "INVALID_FILTER", "分页或筛选条件无效");
  const values = [q, folderId, status, req.query.libraryId || null, req.query.usable === "true", req.query.archived === "true"];
  const filter = `FROM assets a LEFT JOIN media_folders f ON f.id=a.folder_id LEFT JOIN media_libraries l ON l.id=f.library_id
    WHERE ($1='' OR a.display_name ILIKE '%'||$1||'%' OR a.alt_zh ILIKE '%'||$1||'%')
    AND ($2::uuid IS NULL OR a.folder_id=$2) AND ($3::text IS NULL OR a.status=$3)
    AND ($4::uuid IS NULL OR l.id=$4) AND a.archived=$6
    AND (NOT $5::boolean OR (a.status='active' AND NOT a.archived AND
      EXISTS(SELECT 1 FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='copyright' AND c.allowed) AND
      EXISTS(SELECT 1 FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='people' AND c.allowed)))`;
  const count = (await pool.query("SELECT count(*)::int AS total " + filter, values)).rows[0].total;
  const result = await pool.query(`SELECT a.id,a.display_name AS "displayName",a.folder_id AS "folderId",f.name AS "folderName",l.id AS "libraryId",l.name AS "libraryName",a.bytes,a.width,a.height,a.alt_zh AS "altZh",a.alt_en AS "altEn",a.credit,a.source_note AS "sourceNote",a.status,a.created_at AS "createdAt",
    COALESCE((SELECT c.allowed FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='copyright'),false) AS copyright,
    COALESCE((SELECT c.allowed FROM asset_clearances c WHERE c.asset_id=a.id AND c.clearance_type='people'),false) AS people
    ${filter} ORDER BY a.created_at DESC,a.id DESC LIMIT $7 OFFSET $8`, [...values, pageSize, (page - 1) * pageSize]);
  send(req, res, result.rows, { total: count, page, pageSize });
}));
admin.post("/", requireCsrf, uploadOne, wrap(async (req, res) => {
  if (!req.file?.buffer) throw fail(400, "FILE_REQUIRED", "请选择图片");
  const sourceNote = clean(req.body.sourceNote, 2000), credit = clean(req.body.credit, 300);
  const altZh = clean(req.body.altZh, 500), altEn = clean(req.body.altEn, 500);
  if (clean(req.body.displayName, 200).length > 200) throw fail(400, "INVALID_METADATA", "图片名称最多 200 字");
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
      const defaults = await ensureDefaultLibrary(client, req.admin.id);
      const displayName = clean(req.body.displayName, 200) || clean(req.file.originalname, 199) || `图片-${now.toISOString().slice(0, 10)}`;
      const folder = req.body.folderId ? await validFolder(client, req.body.folderId) : defaults.folder;
      const asset = (await client.query(`INSERT INTO assets(storage_key,display_name,folder_id,mime_type,bytes,width,height,alt_zh,alt_en,credit,source_note,created_by)
        VALUES($1,$2,$3,'image/webp',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,status,display_name AS "displayName",folder_id AS "folderId"`,
      [key, displayName, folder.id, output.data.length, output.info.width, output.info.height, altZh, altEn, credit, sourceNote, req.admin.id])).rows[0];
      await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'asset.upload',$2)", [req.admin.id, JSON.stringify({ assetId: asset.id })]);
      return asset;
    });
    send(req, res.status(201), { ...row, bytes: output.data.length, width: output.info.width, height: output.info.height });
  } catch (error) { await fs.unlink(filePath).catch(() => {}); throw error; }
}));
admin.get("/:id", wrap(async (req, res) => {
  const asset = (await pool.query(`SELECT a.id,a.display_name AS "displayName",a.folder_id AS "folderId",f.name AS "folderName",l.id AS "libraryId",l.name AS "libraryName",a.bytes,a.width,a.height,a.alt_zh AS "altZh",a.alt_en AS "altEn",a.credit,a.source_note AS "sourceNote",a.status,a.created_at AS "createdAt" FROM assets a LEFT JOIN media_folders f ON f.id=a.folder_id LEFT JOIN media_libraries l ON l.id=f.library_id WHERE a.id=$1`, [req.params.id])).rows[0];
  if (!asset) throw fail(404, "NOT_FOUND", "图片不存在");
  const clearances = (await pool.query(`SELECT clearance_type AS type,allowed,evidence_note AS "evidenceNote",changed_at AS "changedAt" FROM asset_clearances WHERE asset_id=$1`, [asset.id])).rows;
  const archived = (await pool.query("SELECT archived FROM assets WHERE id=$1", [asset.id])).rows[0].archived;
  send(req, res, { ...asset, archived, clearances });
}));
admin.get("/:id/file", wrap(async (req, res) => {
  const row = (await pool.query("SELECT storage_key FROM assets WHERE id=$1", [req.params.id])).rows[0];
  if (!row) throw fail(404, "NOT_FOUND", "图片不存在");
  res.set("Cache-Control", "no-store");
  res.type("image/webp").sendFile(storagePath(row.storage_key));
}));
admin.put("/:id", requireCsrf, wrap(async (req, res) => {
  const displayName = clean(req.body.displayName, 200), folderId = req.body.folderId || null;
  const altZh = clean(req.body.altZh, 500), altEn = clean(req.body.altEn, 500), credit = clean(req.body.credit, 300), sourceNote = clean(req.body.sourceNote, 2000);
  if (displayName.length > 200) throw fail(400, "INVALID_METADATA", "图片名称最多 200 字");
  if (altZh.length > 500 || altEn.length > 500 || credit.length > 300 || !sourceNote || sourceNote.length > 2000) throw fail(400, "INVALID_METADATA", "请填写图片来源，并检查说明长度");
  const row = await transaction(async client => {
    await validFolder(client, folderId);
    const asset = (await client.query(`UPDATE assets SET display_name=COALESCE(NULLIF($2,''),display_name),folder_id=CASE WHEN $8 THEN $3::uuid ELSE folder_id END,alt_zh=$4,alt_en=$5,credit=$6,source_note=$7,updated_at=now() WHERE id=$1 RETURNING id,status,display_name AS "displayName",folder_id AS "folderId"`, [req.params.id, displayName, folderId, altZh, altEn, credit, sourceNote, req.body.folderId !== undefined])).rows[0];
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
    if (asset.archived) throw fail(409, "ASSET_ARCHIVED", "请先恢复归档图片，再核对并启用");
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
admin.post("/:id/archive", requireCsrf, wrap(async (req, res) => {
  if (typeof req.body.archived !== "boolean") throw fail(400, "INVALID_ARCHIVE", "请指定归档或恢复");
  const row = await transaction(async client => {
    const asset = (await client.query("UPDATE assets SET archived=$2,status=CASE WHEN $2 THEN 'disabled' ELSE 'pending' END,updated_at=now() WHERE id=$1 RETURNING id,archived,status", [req.params.id, req.body.archived])).rows[0];
    if (!asset) throw fail(404, "NOT_FOUND", "图片不存在");
    await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'asset.archive',$2)", [req.admin.id, JSON.stringify(asset)]);
    return asset;
  });
  send(req,res,row);
}));
admin.get("/:id/usages", wrap(async (req, res) => {
  const result = await pool.query(`SELECT i.id,i.type,i.slug,r.version,ca.display_order AS "displayOrder",p.locale AS "publishedLocale"
    FROM content_assets ca JOIN content_revisions r ON r.id=ca.revision_id JOIN content_items i ON i.id=r.content_id
    LEFT JOIN content_publications p ON p.revision_id=r.id WHERE ca.asset_id=$1
    UNION ALL
    SELECT i.id,i.type,i.slug,r.version,0 AS "displayOrder",p.locale AS "publishedLocale"
    FROM member_revisions m JOIN content_revisions r ON r.id=m.revision_id JOIN content_items i ON i.id=r.content_id
    LEFT JOIN content_publications p ON p.revision_id=r.id WHERE m.photo_asset_id=$1
    UNION ALL
    SELECT i.id,i.type,i.slug,r.version,na.position AS "displayOrder",p.locale AS "publishedLocale"
    FROM news_revision_assets na JOIN content_revisions r ON r.id=na.revision_id JOIN content_items i ON i.id=r.content_id
    LEFT JOIN content_publications p ON p.revision_id=r.id WHERE na.asset_id=$1
    UNION ALL
    SELECT s.id,'settings',s.key,s.version,0,p.locale
    FROM site_setting_revisions s LEFT JOIN site_setting_publications p ON p.revision_id=s.id WHERE s.logo_asset_id=$1
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
