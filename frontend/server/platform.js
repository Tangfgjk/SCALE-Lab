"use strict";

const crypto = require("node:crypto");
const express = require("express");
const path = require("node:path");
const { pool } = require("./db/pool");
const auth = require("./auth");
const news = require("./news");
const research = require("./research");
const members = require("./members");
const media = require("./media");
const albums = require("./albums");
const settings = require("./settings");
const accounts = require("./accounts");

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
// Rich text is structured JSON; keep a bounded payload while allowing normal long-form articles.
app.use(express.json({ limit: "768kb" }));
app.get("/api/health", async (req, res, next) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok", requestId: req.requestId }); } catch (error) { next(error); }
});
app.post("/api/admin/v1/session", (req, res, next) => Promise.resolve(auth.createSession(req, res)).catch(next));
app.get("/api/admin/v1/me", auth.requireUser, (req, res, next) => Promise.resolve(auth.refreshMe(req, res)).catch(next));
app.delete("/api/admin/v1/session", auth.requireUser, auth.requireCsrf, (req, res, next) => Promise.resolve(auth.logout(req, res)).catch(next));
app.use("/api/admin/v1", news.admin);
app.use("/api/admin/v1/members", members.admin);
app.use("/api/admin/v1/assets", media.admin);
app.use("/api/admin/v1/activities", albums.admin);
app.use("/api/admin/v1/settings", settings.admin);
app.use("/api/admin/v1", accounts.admin);
app.use("/api/admin/v1", research.admin);
app.use("/api/v1", news.publicApi);
app.get("/api/v1/home", async (req, res, next) => {
  try {
    const locale = req.query.locale === "en" ? "en" : "zh";
    const result = await pool.query(`SELECT i.slug,l.title,l.summary,to_char(n.happened_at,'YYYY-MM-DD') AS "happenedAt"
      FROM content_publications p JOIN content_items i ON i.id=p.content_id
      JOIN content_localizations l ON l.revision_id=p.revision_id AND l.locale=p.locale
      JOIN news_revisions n ON n.revision_id=p.revision_id
      WHERE i.type='news' AND p.locale=$1 ORDER BY n.happened_at DESC LIMIT 5`, [locale]);
    res.json({ data: { latestNews: result.rows }, meta: null, requestId: req.requestId });
  } catch (error) { next(error); }
});
app.use("/api/v1/members", members.publicApi);
app.use("/api/v1/assets", media.publicApi);
app.use("/api/v1/activities", albums.publicApi);
app.use("/api/v1/settings", settings.publicApi);
app.use("/api/v1", research.publicApi);

const site = path.resolve(__dirname, "../visual-preview-20261013");
const adminDir = path.resolve(__dirname, "../admin");
const sharedDir = path.resolve(__dirname, "../shared");
app.use("/admin", express.static(adminDir, { index: "index.html" }));
app.use("/shared", express.static(sharedDir));
app.use(express.static(site, { index: "index.html" }));
app.use((req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "页面或接口不存在" }, requestId: req.requestId }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || (error.code === "23505" ? 409 : error.code === "22P02" ? 400 : 500);
  if (status >= 500) console.error(req.requestId, error);
  const message = status >= 500 ? "服务器暂时无法处理请求" : error.message;
  res.status(status).json({ error: { code: error.code === "23505" ? "DUPLICATE" : error.code || "SERVER_ERROR", message }, requestId: req.requestId });
});

const port = Number(process.env.PORT || 3004);
const host = process.env.HOST || "127.0.0.1";
app.listen(port, host, () => console.log(`SCALE Lab platform: http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/`));
