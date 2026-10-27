"use strict";

// Curated factual records from the CCNU faculty page, approved for site publication by the user.
// Avoid copying the page's prose; retain source URLs and a dated snapshot note on every revision.
const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const login = process.env.ADMIN_LOGIN, password = process.env.ADMIN_PASSWORD;
if (!login || !password) throw new Error("Set ADMIN_LOGIN and ADMIN_PASSWORD in the environment.");
const faculty = "https://faculty.ccnu.edu.cn/wangzhifeng/zh_CN/index.htm";
const sourceNote = "华中师范大学王志锋教师主页，2026-10-13 访问；用户已明确确认该站内容可用于本网站。";
let cookie = "", csrf = "";

async function request(endpoint, method = "GET", body) {
  const response = await fetch(base + endpoint, { method, headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}),
    ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0];
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${endpoint}: ${response.status} ${result.error?.code || JSON.stringify(result)}`);
  return result.data;
}
async function find(kind, slug) {
  const rows = await request(`/api/admin/v1/${kind}?q=${encodeURIComponent(slug)}`);
  return rows.find(row => row.slug === slug);
}
async function publishMember(member) {
  const existing = await find("members", member.slug);
  if (existing?.published) return;
  const data = { locale: "zh", nameEn: "", bio: "", interests: [], homepageUrl: "", orcidUrl: "", githubUrl: "",
    publicEmail: "", destination: "", displayOrder: 0, sourceUrl: faculty, sourceNote, ...member };
  const saved = existing ? await request(`/api/admin/v1/members/${existing.id}?locale=zh`) : await request("/api/admin/v1/members", "POST", data);
  if (existing && (saved.nameZh !== data.nameZh || saved.category !== data.category)) throw new Error(`Existing member differs: ${member.slug}`);
  const id = saved.id, version = saved.version;
  const evidenceNote = `用户于 2026-10-13 明确允许使用 ${faculty} 的公开内容；该成员资料见教师主页。`;
  await request(`/api/admin/v1/members/${id}/permissions`, "POST", { field: "profile", permitted: true, evidenceNote });
  if (member.bio) await request(`/api/admin/v1/members/${id}/permissions`, "POST", { field: "bio", permitted: true, evidenceNote });
  if (member.destination) await request(`/api/admin/v1/members/${id}/permissions`, "POST", { field: "destination", permitted: true, evidenceNote });
  if (saved.reviewState !== "ready") await request(`/api/admin/v1/members/${id}/check`, "POST", { locale: "zh", expectedVersion: version });
  await request(`/api/admin/v1/members/${id}/publish`, "POST", { locale: "zh", expectedVersion: version });
}
async function publishResearch(kind, item) {
  const existing = await find(kind, item.slug);
  const data = { locale: "zh", body: "", sourceNote, ...item };
  const current = existing && await request(`/api/admin/v1/${kind}/${existing.id}?locale=zh`);
  if (current && current.title !== data.title) throw new Error(`Existing ${kind} differs: ${item.slug}`);
  if (current?.published && current.summary === data.summary) return;
  const saved = existing ? await request(`/api/admin/v1/${kind}/${existing.id}/draft`, "PUT", { ...data, expectedVersion: existing.version })
    : await request(`/api/admin/v1/${kind}`, "POST", data);
  const id = saved.id, version = saved.version;
  if (saved.reviewState !== "ready") await request(`/api/admin/v1/${kind}/${id}/check`, "POST", { locale: "zh", expectedVersion: version });
  await request(`/api/admin/v1/${kind}/${id}/publish`, "POST", { locale: "zh", expectedVersion: version });
}

const advisor = {
  slug: "wang-zhifeng", nameZh: "王志锋", category: "advisor", role: "教授 · 博士生导师 · 硕士生导师",
  bio: "华中师范大学人工智能教育学部教授。研究涉及生成式人工智能、智能音视频处理、教育大数据、学习分析与人机交互等。教师主页列示其主持国家自然科学基金项目 3 项，发表论文 160 余篇，出版学术著作 6 部，获授权发明专利 32 项。",
  interests: ["生成式人工智能", "智能音视频处理", "教育大数据", "学习分析", "人机交互"], homepageUrl: faculty
};
const doctoral = ["侯玉林", "王思雨"];
const masters = ["斯雨婕", "王小艺", "李龙龙", "苏美欣", "万佳琴", "沈嘉良", "董曜玮", "王贞颖", "郑昕玥", "唐照康", "王明辉", "李皓炜", "毕鹏飞", "冯尧", "刘金羽", "董润研", "王岩", "李泰愚"];
// The faculty page lists 侯玉林 both as a current doctoral student and a master's alumnus; show one current profile.
const alumni = [
  ["陆子欣", "阿里巴巴"], ["胡文婷", "长江存储"], ["刘特", "阿里巴巴"], ["王熙源", "国家电网"],
  ["李璐瑶", "字节跳动"], ["何佳琪", "字节跳动"], ["严文星", "联想集团"], ["李林青", "澳大利亚读博"],
  ["叶昊骅", "字节跳动"], ["姚嘉龙", "东风公司"], ["熊莎莎", "北京师范大学读博"], ["张敏", "网易游戏"],
  ["方照一", "知识产权局"], ["张晓琳", "阿里巴巴"], ["梅王智汇", "英特尔"], ["方舟", "腾讯"],
  ["陈喆", "百度"], ["裴晓欢", "悉尼大学读博"], ["张雪迪", "广州任教"], ["廖颖枫", "深圳任教"],
  ["刘若琛", "工商银行总行"], ["刘继斌", "京东，产品经理"], ["湛健", "航天五院，算法工程师"],
  ["王静", "网易游戏，算法工程师"], ["朱琳", "武汉晴川学院，教师"]
];

const publications = [
  { slug: "gckt-2026", title: "GCKT: Context-Aware Gating of Heterogeneous Learning Features With Transformer for Cognitive Knowledge Tracing in Intelligent Tutoring Systems",
    summary: "发表于 International Journal of Intelligent Systems，2026，文章号 3037960。", year: 2026,
    authors: "Zhifeng Wang, Jinyu Liu, Chunyan Zeng", venue: "International Journal of Intelligent Systems", stage: "published", doi: "", badge: "",
    externalUrl: "https://faculty.ccnu.edu.cn/wangzhifeng/zh_CN/lwcg/236817/content/112921.htm",
    sourceUrl: "https://faculty.ccnu.edu.cn/wangzhifeng/zh_CN/lwcg/236817/content/112921.htm" },
  { slug: "slbdetection-net-2025", title: "SLBDetection-Net: Towards closed-set and open-set student learning behavior detection in smart classroom of K-12 education",
    summary: "发表于 Expert Systems with Applications，2025，卷 260，文章号 125392。", year: 2025,
    authors: "Zhifeng Wang, Longlong Li, Chunyan Zeng, Shi Dong, Jianwen Sun", venue: "Expert Systems with Applications", stage: "published", doi: "", badge: "",
    externalUrl: "https://faculty.ccnu.edu.cn/wangzhifeng/zh_CN/lwcg/236817/content/12401.htm",
    sourceUrl: "https://faculty.ccnu.edu.cn/wangzhifeng/zh_CN/lwcg/236817/content/12401.htm" },
  { slug: "ai-visual-report-2024", title: "Design and implementation of an AI-enabled visual report tool as formative assessment to promote learning achievement and self-regulated learning: An experimental study",
    summary: "发表于 British Journal of Educational Technology，2024，55(3)：1253–1276。", year: 2024,
    authors: "Xiaofang Liao, Xuedi Zhang, Zhifeng Wang, Heng Luo", venue: "British Journal of Educational Technology", stage: "published", doi: "", badge: "",
    externalUrl: "https://faculty.ccnu.edu.cn/wangzhifeng/zh_CN/lwcg/236817/content/12400.htm",
    sourceUrl: "https://faculty.ccnu.edu.cn/wangzhifeng/zh_CN/lwcg/236817/content/12400.htm" },
  { slug: "learning-diagnosis-graph-2025", title: "基于时空图卷积网络的智能学习诊断模型",
    summary: "发表于《华中师范大学学报》，2025，59(5)：730–742。", year: 2025,
    authors: "王志锋, 沈嘉良, 侯玉林, 严文星, 罗恒, 左明章", venue: "华中师范大学学报", stage: "published", doi: "", badge: "",
    externalUrl: "https://faculty.ccnu.edu.cn/wangzhifeng/zh_CN/lwcg/236817/content/112922.htm",
    sourceUrl: "https://faculty.ccnu.edu.cn/wangzhifeng/zh_CN/lwcg/236817/content/112922.htm" }
];

const projects = [
  { slug: "nsfc-62577027", title: "国家自然科学基金面上项目（62577027）", summary: "王志锋主持；2026 年 1 月至 2029 年 12 月。",
    grantCode: "62577027", fundingType: "国家自然科学基金面上项目", role: "主持", projectStatus: "ongoing", startsOn: "2026-01-01", endsOn: "2029-12-31", sourceUrl: faculty },
  { slug: "nsfc-61501199", title: "国家自然科学基金项目（61501199）", summary: "王志锋主持；2016 年 1 月至 2018 年 12 月。",
    grantCode: "61501199", fundingType: "国家自然科学基金", role: "主持", projectStatus: "completed", startsOn: "2016-01-01", endsOn: "2018-12-31", sourceUrl: faculty },
  { slug: "hubei-2017cfb683", title: "湖北省自然科学基金项目（2017CFB683）", summary: "王志锋主持；2018 年 1 月至 2019 年 12 月。",
    grantCode: "2017CFB683", fundingType: "湖北省自然科学基金", role: "主持", projectStatus: "completed", startsOn: "2018-01-01", endsOn: "2019-12-31", sourceUrl: faculty },
  { slug: "hubei-2014cfb660", title: "湖北省自然科学基金项目（2014CFB660）", summary: "王志锋主持；2014 年 1 月至 2015 年 12 月。",
    grantCode: "2014CFB660", fundingType: "湖北省自然科学基金", role: "主持", projectStatus: "completed", startsOn: "2014-01-01", endsOn: "2015-12-31", sourceUrl: faculty }
];

async function main() {
  const session = await request("/api/admin/v1/session", "POST", { login, password }); csrf = session.csrfToken;
  await publishMember(advisor);
  for (const [index, nameZh] of doctoral.entries()) await publishMember({ slug: `faculty-doctoral-${String(index + 1).padStart(2, "0")}`, nameZh, category: "student", role: "在读博士生", displayOrder: index + 1 });
  for (const [index, nameZh] of masters.entries()) await publishMember({ slug: `faculty-master-${String(index + 1).padStart(2, "0")}`, nameZh, category: "student", role: "在读硕士生", displayOrder: index + 10 });
  for (const [index, [nameZh, destination]] of alumni.entries()) await publishMember({ slug: `faculty-alumni-${String(index + 1).padStart(2, "0")}`, nameZh, category: "alumni", role: "毕业研究生", destination, displayOrder: index + 1 });
  for (const publication of publications) await publishResearch("publications", publication);
  for (const project of projects) await publishResearch("projects", project);
  const members = await request("/api/v1/members?locale=zh");
  const papers = await request("/api/v1/publications?locale=zh");
  const funded = await request("/api/v1/projects?locale=zh");
  assert(members.some(row => row.slug === advisor.slug && row.bio.includes("160 余篇")));
  assert.equal(members.filter(row => row.category === "student").length, doctoral.length + masters.length);
  assert.equal(members.filter(row => row.category === "alumni").length, alumni.length);
  assert(publications.every(item => papers.some(row => row.slug === item.slug && row.sourceUrl === item.sourceUrl)));
  assert(projects.every(item => funded.some(row => row.slug === item.slug && row.sourceUrl === item.sourceUrl)));
  console.log(JSON.stringify({ members: members.length, students: doctoral.length + masters.length, alumni: alumni.length,
    publications: papers.length, projects: funded.length, source: faculty }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
