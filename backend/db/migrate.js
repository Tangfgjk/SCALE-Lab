"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { pool } = require("./pool");

async function main() {
  const files = fs.readdirSync(path.join(__dirname, "migrations")).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  const client = await pool.connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const filename of files) {
      const sql = fs.readFileSync(path.join(__dirname, "migrations", filename), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(731027)");
        const existing = await client.query("SELECT checksum FROM schema_migrations WHERE filename=$1", [filename]);
        if (existing.rows.length) {
          if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${filename}`);
          await client.query("COMMIT");
          process.stdout.write(`Already applied ${filename}\n`);
          continue;
        }
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)", [filename, checksum]);
        await client.query("COMMIT");
        process.stdout.write(`Applied ${filename}\n`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
