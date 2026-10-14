"use strict";

const { pool, transaction } = require("../db/pool");
const { hashPassword } = require("../auth");

async function main() {
  const login = String(process.env.ADMIN_LOGIN || "").trim();
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD for the initial local administrator.");
  const existing = await pool.query("SELECT 1 FROM admin_identities WHERE provider='local' AND provider_subject=$1", [login]);
  if (existing.rows.length) throw new Error("Local administrator already exists; bootstrap will not overwrite it.");
  const passwordHash = await hashPassword(password);
  await transaction(async client => {
    const result = await client.query("INSERT INTO admin_users(display_name,role) VALUES($1,'admin') RETURNING id", [login]);
    const id = result.rows[0].id;
    await client.query("INSERT INTO admin_identities(user_id,provider,provider_subject) VALUES($1,'local',$2)", [id, login]);
    await client.query("INSERT INTO admin_password_credentials(user_id,password_hash) VALUES($1,$2)", [id, passwordHash]);
    await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'account.bootstrap',$2)", [id, JSON.stringify({ login })]);
  });
  process.stdout.write(`Created local administrator: ${login}\n`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
