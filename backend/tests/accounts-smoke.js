"use strict";

const assert = require("node:assert/strict");
const { pool, transaction } = require("../db/pool");
const base = require("./test-environment").base;
const login = process.env.ADMIN_LOGIN, password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD.");
const fixtureLogin = `accttest${Date.now()}`;
let fixtureId = null;
function client() {
  let cookie = "", csrf = "";
  return { async call(path, method = "GET", data) {
    const response = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0];
    const body = await response.json();
    if (response.ok && body.data?.csrfToken) csrf = body.data.csrfToken;
    return { status: response.status, body };
  } };
}
async function main() {
  const anonymous = client(), owner = client(), editor = client();
  assert.equal((await anonymous.call("/api/admin/v1/users")).status, 401);
  assert.equal((await owner.call("/api/admin/v1/session", "POST", { login, password })).status, 200);
  const weak = await owner.call("/api/admin/v1/users", "POST", { login: fixtureLogin, displayName: "联调账号", role: "content_manager", password: "short" });
  assert.equal(weak.body.error.code, "INVALID_PASSWORD");
  const created = await owner.call("/api/admin/v1/users", "POST", { login: fixtureLogin, displayName: "联调账号", role: "content_manager", password: "LocalTestPass-2026" });
  assert.equal(created.status, 201, JSON.stringify(created.body)); fixtureId = created.body.data.id;
  assert.equal((await editor.call("/api/admin/v1/session", "POST", { login: fixtureLogin, password: "LocalTestPass-2026" })).status, 200);
  assert.equal((await editor.call("/api/admin/v1/users")).status, 403);
  assert.equal((await editor.call("/api/admin/v1/news")).status, 200);
  assert.equal((await owner.call(`/api/admin/v1/users/${fixtureId}`, "PATCH", { displayName: "联调账号", role: "admin", isActive: true })).status, 200);
  assert.equal((await editor.call("/api/admin/v1/users")).status, 200);
  assert.equal((await owner.call(`/api/admin/v1/users/${fixtureId}`, "PATCH", { displayName: "联调账号", role: "content_manager", isActive: true })).status, 200);
  assert.equal((await editor.call("/api/admin/v1/users")).status, 403);
  assert.equal((await editor.call("/api/admin/v1/me/password", "POST", { currentPassword: "wrong", newPassword: "NewLocalPass-2026" })).body.error.code, "CURRENT_PASSWORD_INVALID");
  assert.equal((await editor.call("/api/admin/v1/me/password", "POST", { currentPassword: "LocalTestPass-2026", newPassword: "NewLocalPass-2026" })).status, 200);
  assert.equal((await client().call("/api/admin/v1/session", "POST", { login: fixtureLogin, password: "NewLocalPass-2026" })).status, 200);
  assert.equal((await owner.call(`/api/admin/v1/users/${fixtureId}/reset-password`, "POST", { password: "ResetLocalPass-2026" })).status, 200);
  assert.equal((await editor.call("/api/admin/v1/news")).status, 401);
  assert.equal((await client().call("/api/admin/v1/session", "POST", { login: fixtureLogin, password: "ResetLocalPass-2026" })).status, 200);
  const selfId = (await owner.call("/api/admin/v1/me")).body.data.id;
  assert.equal((await owner.call(`/api/admin/v1/users/${selfId}`, "PATCH", { displayName: login, role: "admin", isActive: false })).body.error.code, "SELF_LOCKOUT");
  const filtered = await owner.call(`/api/admin/v1/audit-events?action=account.create&actorId=${selfId}`);
  assert.equal(filtered.status, 200); assert.equal(filtered.body.data.some(row => row.detail_json?.userId === fixtureId), true);
  assert.equal((await owner.call("/api/admin/v1/audit-events?from=2026-10-13&to=2026-10-13")).status, 200);
  assert.equal((await owner.call("/api/admin/v1/audit-events?from=2026-99-99")).body.error.code, "INVALID_FILTER");
  assert.equal((await owner.call(`/api/admin/v1/users/${fixtureId}`, "PATCH", { displayName: "联调账号", role: "content_manager", isActive: false })).status, 200);
  assert.equal((await client().call("/api/admin/v1/session", "POST", { login: fixtureLogin, password: "ResetLocalPass-2026" })).status, 401);
  assert.equal((await editor.call("/api/admin/v1/news")).status, 401);
  assert.equal((await owner.call(`/api/admin/v1/users/${fixtureId}`, "PATCH", { displayName: "联调账号", role: "content_manager", isActive: true })).status, 200);
  assert.equal((await client().call("/api/admin/v1/session", "POST", { login: fixtureLogin, password: "ResetLocalPass-2026" })).status, 200);
  assert.equal((await owner.call(`/api/admin/v1/users/${fixtureId}`, "PATCH", { displayName: "联调账号", role: "content_manager", isActive: false })).status, 200);
  console.log("PASS: role changes, editor content access, password change/reset, session revocation, disable/reactivate, self-lockout, audit filters");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try {
    if (fixtureId) await transaction(async db => {
      await db.query("DELETE FROM audit_events WHERE actor_id=$1 OR detail_json->>'userId'=$1::text", [fixtureId]);
      await db.query("DELETE FROM admin_sessions WHERE user_id=$1", [fixtureId]);
      await db.query("DELETE FROM admin_password_credentials WHERE user_id=$1", [fixtureId]);
      await db.query("DELETE FROM admin_identities WHERE user_id=$1", [fixtureId]);
      await db.query("DELETE FROM admin_users WHERE id=$1", [fixtureId]);
    });
  } catch (error) { console.error("Fixture cleanup failed:", error); process.exitCode = 1; }
  await pool.end();
});
