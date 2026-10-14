"use strict";

const { Pool } = require("pg");

function connectionOptions() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL };
  if (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER) return {};
  throw new Error("Set DATABASE_URL or PGHOST, PGDATABASE and PGUSER before starting the server.");
}

const pool = new Pool({ ...connectionOptions(), max: 10, connectionTimeoutMillis: 5000 });
pool.on("error", error => console.error("PostgreSQL idle connection error:", error.message));

async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, transaction };
