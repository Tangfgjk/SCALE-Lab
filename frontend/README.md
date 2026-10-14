# SCALE Lab 网站

本目录包含中文版公开站、内容工作台和 Express/PostgreSQL 内容平台。当前开发入口是 `server/platform.js`；`server/server.js` 是早期 JSON 原型，仅保留作历史参考。项目决策与验收证据见 [文档索引](../docs/文档索引_20261013.md) 和 [V2 阶段验收](../docs/测试文档/首版功能阶段验收与缺陷清单_20261014.md)。

## 当前状态（2026-10-14）

- 公开站：首页、团队、研究、文化；桌面与手机两种视口已检查。
- 内容工作台：新闻、研究方向、论文、项目、成员、媒体库、活动相册、站点设置、账号和操作记录的基础流程可用。
- 新闻编辑：新建时自动生成可调整的 URL 标识；分类由系统默认；核查依据链接和说明均为选填。首页新闻可打开已发布的全文详情页，未发布或已撤回内容不可公开访问。
- 正式中文资料：实验室基础信息、三类研究方向名称；团队页含王志锋、刘晓雪、熊宇轩及 20 位在读学生、25 位校友。教师肖像来自华中师范大学教师主页，经媒体库授权后展示。研究页有 4 篇代表论文和 4 项项目。
- 阶段结论：**核心功能初步完成，可进入真实使用体验与细节修复；尚未达到云端正式发布标准。**真实新闻、活动图片、联系渠道、英文译文、列表分页与云端备份部署仍待完成。

## 目录

| 路径 | 用途 |
| --- | --- |
| `visual-preview-20261013/` | 当前公开站 HTML、CSS、JS；静态资源与 API 共同渲染页面 |
| `admin/` | A 侧栏内容工作台 |
| `server/platform.js` | 当前网站与管理 API 入口 |
| `server/db/migrations/` | PostgreSQL 增量迁移，包含成员照片媒体关联 |
| `server/scripts/` | 初始化管理员、来源资料导入、旧数据核对 |
| `server/seed-media/` | 三位教师在官方主页公开的肖像原图快照及可重复导入素材 |
| `server/tests/` | 各模块冒烟测试 |
| `server/storage/media/` | 本地上传及转换后的媒体文件；不提交 Git，部署时必须备份 |

## 本地启动（PowerShell）

需要 Node.js 20.9+、Docker Desktop。以下命令在 `frontend/server` 目录执行；密码通过环境变量设置，不写入仓库。

```powershell
$env:SCALE_LAB_DB_PASSWORD = '<本地数据库密码>'
docker compose -f compose.local.yml up -d
npm ci
$env:DATABASE_URL = 'postgres://scale_lab:<URL编码后的数据库密码>@127.0.0.1:5433/scale_lab'
npm run db:migrate
$env:ADMIN_LOGIN = '<首次管理员登录名>'
$env:ADMIN_PASSWORD = '<首次管理员密码>'
npm run db:bootstrap-admin  # 只在全新数据库执行一次
$env:PORT = '3001'
npm start
```

公开站：`http://127.0.0.1:3001/`；内容工作台：`http://127.0.0.1:3001/admin/`；健康检查：`http://127.0.0.1:3001/api/health`。既有本地数据库不需要再次运行管理员初始化脚本。若 Docker Desktop 重启后容器没有自动运行，先启动该容器再访问网站。

### 在新数据库恢复本阶段来源内容

完成迁移与管理员初始化，并保持网站服务运行后，在另一个终端设置同一管理员的 `ADMIN_LOGIN`、`ADMIN_PASSWORD`，依次执行：

```powershell
node scripts/import-faculty-profile-20261013.js
node scripts/import-teachers-20261014.js
```

脚本通过管理 API 保存来源、核查和发布记录；重复执行不会重复创建同一批成员及肖像。内容与照片原始链接见[来源记录](../docs/内容文档/王志锋教师主页数据来源与采纳记录_20261013.md)及[新增教师记录](../docs/内容文档/新增教师与肖像来源记录_20261014.md)。

## 测试

在网站与数据库运行时，设置 `TEST_BASE_URL`、`ADMIN_LOGIN`、`ADMIN_PASSWORD` 和 `DATABASE_URL`，执行：

```powershell
npm run test:smoke
npm run test:bilingual-news
npm run test:research
npm run test:bilingual-research
npm run test:members
npm run test:bilingual-members
npm run test:member-photo
npm run test:media-albums
npm run test:settings
npm run test:accounts
```

测试会创建并撤回本地合成内容；请只对开发数据库运行。2026-10-14 上述测试均通过，页面验收与剩余问题见[阶段验收记录](../docs/测试文档/首版功能阶段验收与缺陷清单_20261014.md)。

## 发布前仍需完成

选择云服务器、域名和 HTTPS 反向代理，设置生产密钥与独立账号，演练 PostgreSQL 与 `server/storage/media/` 的备份恢复；补齐真实内容、英文译文、分页和完整可访问性回归。当前 `platform.js` 仅监听本机 `127.0.0.1`，不能直接视为已完成公网部署。
