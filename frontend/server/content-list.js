"use strict";

const { pool } = require("./db/pool");
// Names emitted by the repository's smoke tests; unrelated business titles are never classified by keyword.
const testSlugPattern = "^(smoke-|workflow-smoke-|bilingual-|test-|browser-(check|paper|member)-20261013$|future-[0-9]{13}$)";
const config = {
  news: { join: "LEFT JOIN news_revisions x ON x.revision_id=zh.id", fields: "to_char(x.happened_at,'YYYY-MM-DD') AS happened_at,x.category", date: "happened_at" },
  member: { join: "LEFT JOIN member_revisions x ON x.revision_id=zh.id", fields: 'l.title AS "nameZh",x.category,x.display_order', order: "display_order ASC NULLS LAST," },
  activity: { join: "LEFT JOIN activity_revisions x ON x.revision_id=zh.id", fields: 'to_char(x.activity_date,\'YYYY-MM-DD\') AS "activityDate"' },
  direction: {}, publication: {}, project: {}
};

async function listContent(type, query) {
  const kind = config[type];
  if (!kind) throw new Error("Unsupported content list");
  const state = query.state || "all", sort = query.sort || "updated", scope = query.scope || "all";
  const page = Number(query.page || 1), pageSize = Number(query.pageSize || 100);
  const category=type === "news" ? String(query.category || "all") : "all";
  if (!["all","news","activity"].includes(category)) throw Object.assign(new Error("内容类型无效"),{status:400,code:"INVALID_FILTER"});
  const q = String(query.q || "").trim();
  if (!["all","draft","ready","published","changes"].includes(state) || !["updated","date"].includes(sort) ||
      !["all","business","test"].includes(scope) || q.length > 200 ||
      !Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw Object.assign(new Error("筛选或分页参数无效"), { status: 400, code: "INVALID_FILTER" });
  const order = sort === "date" && kind.date ? `${kind.date} DESC NULLS LAST,` : query.sort ? "" : kind.order || "";
  const result = await pool.query(`WITH listing AS (
    SELECT i.id,i.slug,i.status,i.version,i.created_at,i.updated_at,l.title,l.summary,l.locale,
      l.review_state,l.review_state AS "reviewState",p.revision_id IS NOT NULL AS published,
      p.revision_id IS NOT NULL AS published_zh,i.slug ~ $4 AS "isTest",
      CASE WHEN p.revision_id=zh.id THEN 'published' WHEN p.revision_id IS NOT NULL THEN 'changes'
        WHEN l.review_state='ready' THEN 'ready' ELSE 'draft' END AS workflow_state
      ${kind.fields ? "," + kind.fields : ""}
    FROM content_items i LEFT JOIN LATERAL (
      SELECT r.id FROM content_revisions r JOIN content_localizations lc ON lc.revision_id=r.id AND lc.locale='zh'
      WHERE r.content_id=i.id ORDER BY r.version DESC LIMIT 1
    ) zh ON true LEFT JOIN content_localizations l ON l.revision_id=zh.id AND l.locale='zh'
    LEFT JOIN content_publications p ON p.content_id=i.id AND p.locale='zh' ${kind.join || ""}
    WHERE i.type=$1 AND ($2='' OR i.slug ILIKE '%'||$2||'%' OR l.title ILIKE '%'||$2||'%')
      AND ($8='all' OR ${type === "news" ? "CASE WHEN x.category='activity' THEN 'activity' ELSE 'news' END" : "'news'"}=$8)
      AND ($3='all' OR ($3='test' AND i.slug ~ $4) OR ($3='business' AND NOT i.slug ~ $4))
  ), filtered AS (SELECT * FROM listing WHERE $5='all' OR workflow_state=$5),
  paged AS (SELECT * FROM filtered ORDER BY ${order}updated_at DESC,id DESC LIMIT $6 OFFSET $7)
  SELECT (SELECT count(*)::int FROM filtered) AS total,
    COALESCE((SELECT json_object_agg(workflow_state,n) FROM
      (SELECT workflow_state,count(*)::int AS n FROM listing GROUP BY workflow_state) counts),'{}'::json) AS counts,
    COALESCE((SELECT json_agg(paged) FROM paged),'[]'::json) AS rows`,
  [type,q,scope,testSlugPattern,state,pageSize,(page-1)*pageSize,category]);
  const row = result.rows[0];
  return { data: row.rows, meta: { total: row.total, page, pageSize, counts: row.counts } };
}
module.exports = { listContent };
