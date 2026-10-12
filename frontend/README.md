# 王志锋教授实验室 · 网站（原型）

仿 **Terrer Lab（MIT）** 的信息架构与排版气质，结合两份设计文档
（`frontend-design.md` 前端与体验设计、`backend-design.md` 后端与内容平台设计），
为**华中师范大学人工智能教育学部 王志锋教授实验室**设计的完整可运行原型。

> 真实信息来自华中师范大学教师主页（王志锋）。凡是主页未给出、需后续补充的字段，
> 在代码与数据中以 **`@@@`** 占位（页面上以橙色虚线高亮显示）。

---

## 1. 目录结构

```
实验室网站/
├── index.html            # 首页：Hero / 研究主题 / 指标 / 画廊 / 最新动态
├── people.html           # 团队成员：导师 / 科研人员 / 在读 / 校友
├── research.html         # 研究成果：方向 / 架构 / 行为识别 Demo / 论文 / 项目
├── culture.html          # 实验室文化：价值观 / 节奏 / 活动影像 / 加入我们
├── assets/
│   ├── css/style.css     # 视觉系统（设计 Token + 组件 + 响应式）
│   └── js/
│       ├── data.js       # 全部页面内容数据（首版评审用，对应文档"页面数据数组"）
│       ├── main.js       # 导航状态 / 页脚 / 数据渲染 / @@@ 高亮
│       └── demo.js       # 研究页"课堂行为识别"交互 Demo（演示数据）
└── server/               # 后端原型（对应 backend-design.md）
    ├── server.js         # Express，实现 /api/v1 只读接口
    ├── package.json
    └── data/content.json # 内容存储（生产替换为 PostgreSQL/D1 + 对象存储）
```

---

## 2. 设计映射

### 2.1 仿 Terrer Lab 的地方
- **宣言式 Hero**：大字号宋体宣言 + 实验室署名（TERRER LAB → 王志锋实验室）。
- **编号研究主题**：`THEME 01–04` 对应 Terrer Lab 的 `01 / 02` 板块式叙事。
- **Key Publications / Lab News**：论文列表与最新动态采用简洁文本行排版。
- **Team 网格**：成员卡片（照片 + 角色 + 简介 + 标签 + 外部链接）。
- **Values**：实验室价值观单列成块（Diversity/Inclusion → 严谨/协作/人本/成长）。

### 2.2 结合 frontend-design.md 的地方
- **信息架构**：`/`（首页）、`/people`、`/research`、`/culture` → 映射为四个 HTML 页面。
- **视觉系统**：深海军蓝 `#081B32`、高饱和蓝 `#1459FF`、青色 `#21D4D1`；正文无衬线、关键宣言用**宋体**；细边框、低圆角、编号系统、信号线、模块化栅格。
- **组件**：`SiteHeader` / `SiteFooter` / `ProfileCard` / `BehaviorDemo` 均已实现。
- **响应式**：>1000px 多栏；661–1000px 降双栏；≤660px 单栏 + 横向滑动画廊；移动端导航用原生 `<details>/<summary>`。
- **交互**：主页横向 `scroll-snap` 画廊；研究页 Demo 切换指标时环形图与文案同步变化，数值标注为**演示数据**。

### 2.3 结合 backend-design.md 的地方
- **数据模型**：Member / News / Publication / Project / ResearchDirection / Activity 已落在 `content.json`。
- **API**：`server/server.js` 实现 `/api/v1/home`、`/members`、`/members/:slug`、`/news`、`/publications`、`/projects`、`/research-directions`、`/activities`，统一响应 `{data, meta, requestId}` 与错误格式。
- **权限边界**：公开站只返回已发布内容并剥离私人邮箱（最小公开原则）；管理端 `/api/admin/v1` 占位（需统一身份认证）。
- **安全**：已加 `CSP / HSTS / X-Content-Type-Options / X-Frame-Options`；行为识别 Demo 使用脱敏演示数据，不与公开官网共用数据域。
- **零数据库运行**：原型直接读 JSON，满足文档"首版不依赖数据库即可运行"。

---

## 3. 如何运行

### 前端（无需构建，直接打开）
用浏览器打开 `index.html` 即可；或在项目根目录起一个静态服务器：
```bash
python3 -m http.server 8080
# 浏览器访问 http://localhost:8080
```

### 后端（Node + Express）
```bash
cd server
npm install        # 安装 express
npm start          # 默认监听 :3000
curl http://localhost:3000/api/v1/home
curl "http://localhost:3000/api/v1/members?category=alumni"
curl "http://localhost:3000/api/v1/publications?year=2026"
```

---

## 4. `@@@` 待补充清单（上线前必须补齐）
- 实验室**正式中英文名**（当前用"王志锋教授实验室"代称）。
- 团队 **Logo**、成员**姓名拼音**、**照片**（需取得公开展示授权）。
- 成员 **ORCID / GitHub / 个人主页 / 邮箱**、校友**毕业去向**细节。
- 论文 **DOI / 外链**；项目**名称**（部分编号已知但名称缺失）。
- **联系邮箱、办公电话、实验室成立年份、地址**。
- 真实**活动照片**、新闻**具体日期**。
- 版权与隐私说明。

---

## 5. 升级到生产架构（文档建议）
1. **前端**：迁移到 Next.js/Vinext + React 19 + TypeScript，内容由 `/api/v1` 在构建/请求时渲染，启用 ISR 增量构建。
2. **后端**：内容管理后台 + Content API + 对象存储（Cloudflare D1+R2 或校内部署 PostgreSQL + 校内 OSS）。
3. **流程**：草稿 → 审核 → 发布 工作流、版本历史、预览链接、缓存刷新、审计日志。
4. **研究联动**：仅接入脱敏/聚合指标，真实课堂数据须独立受控平台建设。
