"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { pool } = require("./db/pool");

const scrypt = promisify(crypto.scrypt);
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const randomToken = () => crypto.randomBytes(32).toString("base64url");
const SESSION_MS = 12 * 60 * 60 * 1000;


async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [algorithm, salt, value] = String(stored || "").split("$");
  if (algorithm !== "scrypt" || !salt || !value) return false;
  const expected = Buffer.from(value, "hex");
  if (expected.length !== 64) return false;
  const actual = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(expected, actual);
}

function cookieValue(req, name) {
  const raw = req.headers.cookie || "";
  const part = raw.split(";").map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  return part ? part.slice(name.length + 1) : null;
}

async function sessionFromRequest(req) {
  const token = cookieValue(req, "scale_lab_session");
  if (!token || token.length > 200) return null;
  const result = await pool.query(
    `SELECT s.id AS session_id,s.csrf_hash,u.id,u.display_name,u.role
       FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.is_active=true`,
    [sha256(token)]
  );
  return result.rows[0] || null;
}

async function requireUser(req, res, next) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "请先登录" }, requestId: req.requestId });
    req.admin = session;
    next();
  } catch (error) { next(error); }
}

function requireCsrf(req, res, next) {
  const value = req.get("x-csrf-token") || "";
  if (!value || sha256(value) !== req.admin.csrf_hash) {
    return res.status(403).json({ error: { code: "CSRF_INVALID", message: "操作令牌无效，请刷新后台页面" }, requestId: req.requestId });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.admin?.role !== "admin") return res.status(403).json({ error: { code: "FORBIDDEN", message: "只有管理员可管理账号" }, requestId: req.requestId });
  next();
}

function issueCookie(req, res, token) {
  const secure = process.env.NODE_ENV === "production" || req.secure;
  res.cookie("scale_lab_session", token, { httpOnly: true, sameSite: "strict", secure, path: "/api/admin/v1", maxAge: SESSION_MS });
}

async function createSession(req, res) {
  const login = String(req.body.login || "").trim();
  const password = String(req.body.password || "");
  if (!login || login.length > 200 || password.length > 128) return res.status(401).json({error:{code:"LOGIN_FAILED",message:"账号或密码错误"}});
  const key = sha256(req.ip + ':' + login), ipKey = sha256('ip:' + req.ip);
  const now = Date.now();
  await pool.query("DELETE FROM login_rate_limits WHERE expires_at < now()");
  const limits = await pool.query(`INSERT INTO login_rate_limits(key_hash,attempts,expires_at)
    SELECT unnest($1::text[]),1,now()+interval '15 minutes'
    ON CONFLICT(key_hash) DO UPDATE SET attempts=login_rate_limits.attempts+1 RETURNING key_hash,attempts`,[[key,ipKey]]);
  if(limits.rows.some(r=>r.attempts>(r.key_hash===key?5:100))){
    res.set('Retry-After','900');
    return res.status(429).json({error:{code:"LOGIN_LIMIT",message:"登录尝试过多，请稍后再试"},requestId:req.requestId});
  }
  const result = await pool.query(
    `SELECT u.id,u.display_name,u.role,c.password_hash FROM admin_identities i
       JOIN admin_users u ON u.id=i.user_id JOIN admin_password_credentials c ON c.user_id=u.id
      WHERE i.provider='local' AND i.provider_subject=$1 AND u.is_active=true`, [login]
  );
  const user = result.rows[0];
  const valid = user ? await verifyPassword(password, user.password_hash) : false;
  if (!valid) {
    return res.status(401).json({ error: { code: "LOGIN_FAILED", message: "账号或密码错误" }, requestId: req.requestId });
  }
  await pool.query("DELETE FROM login_rate_limits WHERE key_hash=$1",[key]);
  const token = randomToken();
  const csrfToken = randomToken();
  await pool.query(
    `INSERT INTO admin_sessions(user_id,token_hash,csrf_hash,expires_at)
     VALUES($1,$2,$3,$4)`, [user.id, sha256(token), sha256(csrfToken), new Date(now + SESSION_MS)]
  );
  issueCookie(req, res, token);
  res.json({ data: { id: user.id, displayName: user.display_name, role: user.role, csrfToken }, meta: null, requestId: req.requestId });
}

async function refreshMe(req, res) {
  const csrfToken = randomToken();
  await pool.query("UPDATE admin_sessions SET csrf_hash=$1 WHERE id=$2", [sha256(csrfToken), req.admin.session_id]);
  res.json({ data: { id: req.admin.id, displayName: req.admin.display_name, role: req.admin.role, csrfToken }, meta: null, requestId: req.requestId });
}

async function logout(req, res) {
  await pool.query("UPDATE admin_sessions SET revoked_at=now() WHERE id=$1", [req.admin.session_id]);
  res.clearCookie("scale_lab_session", { path: "/api/admin/v1" });
  res.json({ data: { signedOut: true }, meta: null, requestId: req.requestId });
}

module.exports = { hashPassword, verifyPassword, requireUser, requireAdmin, requireCsrf, createSession, refreshMe, logout };
