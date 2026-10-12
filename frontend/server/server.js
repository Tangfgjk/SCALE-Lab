/* =========================================================================
   王志锋教授实验室 · 内容 API（后端原型，对应 backend-design.md）
   设计要点：
   - 不依赖数据库即可运行：内容来自 server/data/content.json（生产替换为 PostgreSQL/D1 + 对象存储）。
   - 公开接口前缀 /api/v1，只返回已发布内容；管理端 /api/admin/v1 仅占位说明。
   - 统一响应：{ data, meta:{page,pageSize,total}, requestId }
   - 安全响应头：CSP / HSTS / X-Content-Type-Options；输入校验与限流占位。
   ========================================================================= */

const express = require("express");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "content.json");

// 载入内容（原型阶段直接读 JSON；生产改为数据库查询 + 缓存）
const DB = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

const app = express();
app.use(express.json());

/* ---------- 安全响应头 ---------- */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline';"
  );
  // 仅本地/反向代理前置 HTTPS 时启用 HSTS
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  next();
});

/* ---------- 工具 ---------- */
function rid() {
  return "req_" + Math.random().toString(36).slice(2, 12);
}
function ok(res, data, meta) {
  res.json({ data, meta: meta || null, requestId: rid() });
}
function fail(res, code, message, fields) {
  res.status(code === "NOT_FOUND" ? 404 : 400).json({
    error: { code, message, fields: fields || {} },
    requestId: rid(),
  });
}
function paginate(arr, page = 1, pageSize = 10) {
  page = Math.max(1, parseInt(page, 10) || 1);
  pageSize = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 10));
  const start = (page - 1) * pageSize;
  return {
    data: arr.slice(start, start + pageSize),
    meta: { page, pageSize, total: arr.length },
  };
}
function slugify(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, "-").replace(/[^\w一-龥-]/g, "");
}

/* 为成员补 slug（若 JSON 未提供） */
DB.members = (DB.members || []).map((m) => ({ ...m, slug: m.slug || slugify(m.nameEn || m.nameZh) }));
DB.news = (DB.news || []).map((n) => ({ ...n, slug: n.slug || slugify(n.title) }));

/* ---------- 公开 API：/api/v1 ---------- */
const api = express.Router();

// 首页聚合：研究方向 + 最新新闻 + 关键指标（指标在 content.json 中以 siteSettings 体现，此处组合）
api.get("/home", (req, res) => {
  ok(res, {
    lab: DB.siteSettings,
    pi: DB.pi,
    researchDirections: DB.researchDirections,
    latestNews: DB.news.slice(0, 5),
    gallery: DB.activities,
  });
});

// 成员：可按 category 过滤
api.get("/members", (req, res) => {
  let list = DB.members;
  if (req.query.category) {
    const cat = String(req.query.category).toLowerCase();
    list = list.filter((m) => (m.category || "").toLowerCase() === cat);
  }
  // 遵循“最小公开”：移除私人邮箱等敏感字段
  const safe = list.map(({ emailPublic, ...rest }) => rest);
  ok(res, safe);
});
api.get("/members/:slug", (req, res) => {
  const m = DB.members.find((x) => x.slug === req.params.slug);
  if (!m) return fail(res, "NOT_FOUND", "成员不存在");
  const { emailPublic, ...rest } = m; // 默认不公开私人邮箱
  ok(res, rest);
});

// 新闻
api.get("/news", (req, res) => {
  const r = paginate(DB.news, req.query.page, req.query.pageSize);
  ok(res, r.data, r.meta);
});
api.get("/news/:slug", (req, res) => {
  const n = DB.news.find((x) => x.slug === req.params.slug);
  if (!n) return fail(res, "NOT_FOUND", "新闻不存在");
  ok(res, n);
});

// 论文：可按 year / tag 过滤
api.get("/publications", (req, res) => {
  let list = DB.publications;
  if (req.query.year) list = list.filter((p) => String(p.year) === String(req.query.year));
  if (req.query.tag) list = list.filter((p) => (p.tags || []).includes(req.query.tag));
  // 按年份降序
  list = list.slice().sort((a, b) => b.year - a.year);
  ok(res, list);
});

// 项目：可按 status 过滤
api.get("/projects", (req, res) => {
  let list = DB.projects;
  if (req.query.status) list = list.filter((p) => (p.status || "").toLowerCase() === String(req.query.status).toLowerCase());
  ok(res, list);
});

// 研究方向
api.get("/research-directions", (req, res) => {
  ok(res, DB.researchDirections);
});

// 文化活动 / 相册
api.get("/activities", (req, res) => {
  ok(res, DB.activities);
});

app.use("/api/v1", api);

/* ---------- 管理端占位（生产需登录 + CSRF + 审计日志） ---------- */
app.use("/api/admin/v1", (req, res) => {
  res.status(401).json({
    error: { code: "UNAUTHORIZED", message: "管理端需要统一身份认证；本原型未启用写操作。" },
    requestId: rid(),
  });
});

/* ---------- 健康检查 ---------- */
app.get("/healthz", (req, res) => res.json({ ok: true, ts: Date.now() }));

/* ---------- 启动 ---------- */
app.listen(PORT, () => {
  console.log(`[王志锋教授实验室 API] 已启动：http://localhost:${PORT}/api/v1/home`);
});

module.exports = app;
