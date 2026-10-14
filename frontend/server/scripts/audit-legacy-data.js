#!/usr/bin/env node
"use strict";

// Produces review candidates only. Never marks a legacy record as publishable.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const serverRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(serverRoot, "..", "..");
const frontendDataPath = path.join(workspaceRoot, "frontend", "visual-preview-20261013", "assets", "js", "data.js");
const apiDataPath = path.join(serverRoot, "data", "content.json");
const candidatesPath = path.join(serverRoot, "data", "import-candidates.json");
const reportPath = path.join(workspaceRoot, "docs", "内容文档", "旧数据差异与导入候选清单_20261013.md");

function readFrontendData() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(frontendDataPath, "utf8"), sandbox, {
    filename: "frontend-data.js", timeout: 1000,
  });
  if (!sandbox.window.LAB || typeof sandbox.window.LAB !== "object") {
    throw new Error("frontend data.js did not define window.LAB");
  }
  return sandbox.window.LAB;
}

function clean(value) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ").toLowerCase();
}

function placeholderPaths(value, prefix = "", output = []) {
  if (typeof value === "string" && value.includes("@@@")) output.push(prefix || "value");
  else if (Array.isArray(value)) value.forEach((item, i) => placeholderPaths(item, `${prefix}[${i}]`, output));
  else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => placeholderPaths(item, prefix ? `${prefix}.${key}` : key, output));
  }
  return output;
}

function entries(type, source, data) {
  const make = (record, index, key, title) => ({
    type, source, sourceKey: String(key || index + 1), title: String(title || "(无标题)"),
    placeholderPaths: placeholderPaths(record), reviewState: "unverified", publicationState: "draft",
  });
  if (type === "member" && source === "frontend") {
    const result = [];
    Object.entries(data || {}).forEach(([category, records]) => {
      const list = Array.isArray(records) ? records : records ? [records] : [];
      list.forEach((record, index) => result.push(make(record, index, record.id || `${category}-${index + 1}`, record.nameZh || record.nameEn)));
    });
    return result;
  }
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return list.map((record, index) => {
    const key = record.id || record.slug || record.grant || record.grantNumber || record.title || record.titleZh || record.nameZh;
    const title = type === "member"
      ? (record.nameZh || record.nameEn || record.title)
      : (record.titleZh || record.title || record.nameZh || record.caption || record.grant || record.id);
    return make(record, index, key, title);
  });
}

function matchKey(item) {
  if (item.type === "direction") return clean(item.sourceKey);
  if (item.type === "member") return clean(item.title);
  if (item.type === "project") return clean(item.sourceKey);
  return clean(item.title);
}

function markdownCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function main() {
  const frontend = readFrontendData();
  const api = JSON.parse(fs.readFileSync(apiDataPath, "utf8"));
  const sources = [
    ["direction", frontend.directions, api.researchDirections],
    ["member", frontend.members, api.members],
    ["news", frontend.news, api.news],
    ["publication", frontend.publications, api.publications],
    ["project", frontend.projects, api.projects],
    ["activity", frontend.gallery, api.activities],
    ["setting", frontend.lab, api.siteSettings],
  ];
  const candidates = [];
  const summary = [];
  const differences = [];

  for (const [type, frontendData, apiData] of sources) {
    const left = entries(type, "frontend", frontendData);
    const right = entries(type, "api", apiData);
    const apiByKey = new Map(right.map(item => [matchKey(item), item]));
    const matched = new Set();
    for (const item of left) {
      const other = apiByKey.get(matchKey(item));
      if (other) {
        matched.add(other);
        item.relatedSourceKey = other.sourceKey;
        other.relatedSourceKey = item.sourceKey;
        if (clean(item.title) !== clean(other.title)) {
          differences.push({ type, frontend: item.title, api: other.title, reason: "同标识但名称不同" });
        }
      } else differences.push({ type, frontend: item.title, api: "—", reason: "仅前端数据有此条目" });
    }
    right.filter(item => !matched.has(item)).forEach(item => {
      differences.push({ type, frontend: "—", api: item.title, reason: "仅 API JSON 有此条目" });
    });
    candidates.push(...left, ...right);
    summary.push({ type, frontend: left.length, api: right.length,
      frontendPlaceholders: left.filter(item => item.placeholderPaths.length).length,
      apiPlaceholders: right.filter(item => item.placeholderPaths.length).length });
  }

  fs.writeFileSync(candidatesPath, JSON.stringify({ generatedAt: "2026-10-13", status: "review-only", candidates }, null, 2) + "\n", "utf8");
  const report = [
    "# 旧数据差异与导入候选清单", "",
    "生成日期：2026-10-13。由 `frontend/server/scripts/audit-legacy-data.js` 从优化版 `data.js` 和 `server/data/content.json` 生成。此文件只用于核验，**没有任何条目自动获得发布资格**。完整逐条候选及占位字段见 `frontend/server/data/import-candidates.json`。", "",
    "## 数量与占位", "",
    "| 类型 | 前端条目 | API JSON 条目 | 前端含 `@@@` | API JSON 含 `@@@` |", "| --- | ---: | ---: | ---: | ---: |",
    ...summary.map(row => `| ${row.type} | ${row.frontend} | ${row.api} | ${row.frontendPlaceholders} | ${row.apiPlaceholders} |`), "",
    "## 标识或标题层面的差异", "",
    "匹配只依赖现有 ID、名称或项目编号；同名不证明字段一致，未列出的字段仍需逐项核验。活动画廊的文字与活动记录结构不同，不能因标题接近就自动合并。", "",
    "| 类型 | 前端标题 | API JSON 标题 | 初步问题 |", "| --- | --- | --- | --- |",
    ...differences.map(item => `| ${markdownCell(item.type)} | ${markdownCell(item.frontend)} | ${markdownCell(item.api)} | ${markdownCell(item.reason)} |`), "",
    "## 导入决定", "",
    "1. 两份旧数据均只作为待核验草稿候选；`reviewState=unverified`、`publicationState=draft` 不得被导入脚本自动提升。", "2. 研究方向采用哪一组名称、排序和子主题，仍需负责人确认。", "3. 论文发表阶段、项目进度、成员字段授权、照片版权、首页统计口径和联系邮箱逐项确认后才可发布。", "4. 如需重新生成，在 `frontend/server` 目录执行 `node scripts/audit-legacy-data.js`。", "",
  ].join("\n");
  fs.writeFileSync(reportPath, report, "utf8");
  process.stdout.write(`Wrote ${candidates.length} review candidates and ${differences.length} initial differences.\n`);
}

main();
