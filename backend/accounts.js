"use strict";

const express = require("express");
const { pool, transaction } = require("./db/pool");
const { hashPassword, verifyPassword, requireUser, requireAdmin, requireCsrf } = require("./auth");

const admin = express.Router();
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const send = (req, res, data) => res.json({ data, meta: null, requestId: req.requestId });
const loginPattern = /^[a-z][a-z0-9._-]{2,31}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function passwordOf(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128 || !value.trim()) throw fail(400, "INVALID_PASSWORD", "新密码须为 12–128 个字符");
  return value;
}
function roleOf(value) {
  if (!["admin", "content_manager"].includes(value)) throw fail(400, "INVALID_ROLE", "账号角色无效");
  return value;
}
function displayNameOf(value) {
  const name = String(value ?? "").trim();
  if (!name || name.length > 100) throw fail(400, "INVALID_NAME", "姓名或显示名须为 1–100 个字符");
  return name;
}
async function lockAccounts(client) { await client.query("SELECT pg_advisory_xact_lock(731028)"); }
async function activeCount(client) {
  return Number((await client.query("SELECT count(*) AS count FROM admin_users WHERE is_active=true")).rows[0].count);
}
async function activeAdminCount(client) {
  return Number((await client.query("SELECT count(*) AS count FROM admin_users WHERE is_active=true AND role='admin'")).rows[0].count);
}
async function audit(client, actorId, action, userId, detail = {}) {
  await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,$2,$3)", [actorId, action, JSON.stringify({ userId, ...detail })]);
}

admin.use(requireUser);
admin.post("/me/password", requireCsrf, wrap(async (req, res) => {
  const oldPassword = String(req.body.currentPassword ?? ""), newPassword = passwordOf(req.body.newPassword);
  const result = await pool.query("SELECT password_hash FROM admin_password_credentials WHERE user_id=$1", [req.admin.id]);
  if (!result.rows[0] || !await verifyPassword(oldPassword, result.rows[0].password_hash)) throw fail(403, "CURRENT_PASSWORD_INVALID", "当前密码不正确");
  const nextHash = await hashPassword(newPassword);
  await transaction(async client => {
    await client.query("UPDATE admin_password_credentials SET password_hash=$1,updated_at=now() WHERE user_id=$2", [nextHash, req.admin.id]);
    await client.query("UPDATE admin_sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL", [req.admin.id, req.admin.session_id]);
    await audit(client, req.admin.id, "account.password_change", req.admin.id);
  });
  send(req, res, { changed: true, otherSessionsRevoked: true });
}));

admin.use("/users", requireAdmin);
admin.get("/users", wrap(async (req, res) => {
  const result = await pool.query(`SELECT u.id,u.display_name AS "displayName",u.role,u.is_active AS "isActive",u.created_at AS "createdAt",
    i.provider_subject AS login FROM admin_users u LEFT JOIN admin_identities i ON i.user_id=u.id AND i.provider='local'
    ORDER BY u.created_at,u.id`);
  send(req, res, result.rows);
}));
admin.post("/users", requireCsrf, wrap(async (req, res) => {
  const login = String(req.body.login ?? "").trim(), displayName = displayNameOf(req.body.displayName);
  const role = roleOf(req.body.role), passwordHash = await hashPassword(passwordOf(req.body.password));
  if (!loginPattern.test(login)) throw fail(400, "INVALID_LOGIN", "登录名须以小写字母开头，长度 3–32，可含数字、点、下划线和短横线");
  const row = await transaction(async client => {
    await lockAccounts(client);
    if (await activeCount(client) >= 5) throw fail(409, "ACCOUNT_LIMIT", "当前已达到 5 个启用账号");
    const user = (await client.query("INSERT INTO admin_users(display_name,role) VALUES($1,$2) RETURNING id,display_name AS \"displayName\",role,is_active AS \"isActive\"", [displayName, role])).rows[0];
    await client.query("INSERT INTO admin_identities(user_id,provider,provider_subject) VALUES($1,'local',$2)", [user.id, login]);
    await client.query("INSERT INTO admin_password_credentials(user_id,password_hash) VALUES($1,$2)", [user.id, passwordHash]);
    await audit(client, req.admin.id, "account.create", user.id, { login, role });
    return { ...user, login };
  });
  res.status(201); send(req, res, row);
}));
admin.patch("/users/:id", requireCsrf, wrap(async (req, res) => {
  if (!uuidPattern.test(req.params.id)) throw fail(400, "INVALID_ID", "账号 ID 无效");
  const displayName = displayNameOf(req.body.displayName), role = roleOf(req.body.role);
  if (typeof req.body.isActive !== "boolean") throw fail(400, "INVALID_STATUS", "启用状态无效");
  const changed = await transaction(async client => {
    await lockAccounts(client);
    const row = (await client.query("SELECT id,role,is_active AS \"isActive\" FROM admin_users WHERE id=$1 FOR UPDATE", [req.params.id])).rows[0];
    if (!row) throw fail(404, "NOT_FOUND", "账号不存在");
    if (row.id === req.admin.id && (!req.body.isActive || role !== "admin")) throw fail(409, "SELF_LOCKOUT", "不能停用自己或移除自己的管理员身份");
    if (row.isActive && row.role === "admin" && (!req.body.isActive || role !== "admin") && await activeAdminCount(client) <= 1)
      throw fail(409, "LAST_ADMIN", "必须保留至少一名启用的管理员");
    if (!row.isActive && req.body.isActive && await activeCount(client) >= 5) throw fail(409, "ACCOUNT_LIMIT", "当前已达到 5 个启用账号");
    const updated = (await client.query("UPDATE admin_users SET display_name=$1,role=$2,is_active=$3,updated_at=now() WHERE id=$4 RETURNING id,display_name AS \"displayName\",role,is_active AS \"isActive\"", [displayName, role, req.body.isActive, row.id])).rows[0];
    if (row.isActive && !updated.isActive) await client.query("UPDATE admin_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [row.id]);
    await audit(client, req.admin.id, "account.update", row.id, { before: { role: row.role, isActive: row.isActive }, after: { role: updated.role, isActive: updated.isActive } });
    return updated;
  });
  send(req, res, changed);
}));
admin.post("/users/:id/reset-password", requireCsrf, wrap(async (req, res) => {
  if (!uuidPattern.test(req.params.id)) throw fail(400, "INVALID_ID", "账号 ID 无效");
  if (req.params.id === req.admin.id) throw fail(409, "USE_OWN_PASSWORD", "请使用修改本人密码功能");
  const passwordHash = await hashPassword(passwordOf(req.body.password));
  await transaction(async client => {
    await lockAccounts(client);
    const user = (await client.query("SELECT id FROM admin_users WHERE id=$1 FOR UPDATE", [req.params.id])).rows[0];
    if (!user) throw fail(404, "NOT_FOUND", "账号不存在");
    const credentials = await client.query("UPDATE admin_password_credentials SET password_hash=$1,updated_at=now() WHERE user_id=$2", [passwordHash, user.id]);
    if (!credentials.rowCount) throw fail(409, "NO_LOCAL_CREDENTIAL", "该账号没有专用密码凭据");
    await client.query("UPDATE admin_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [user.id]);
    await audit(client, req.admin.id, "account.password_reset", user.id);
  });
  send(req, res, { changed: true, sessionsRevoked: true });
}));

module.exports = { admin };
