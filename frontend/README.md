# SCALE Lab 网站

本目录包含中文版公开站、内容工作台和 Express/PostgreSQL 内容平台。当前开发入口是 `server/platform.js`；`server/server.js` 是早期 JSON 原型，仅保留作历史参考。项目决策与验收证据见 [文档索引](../docs/文档索引_20261013.md) 和 [V2 阶段验收](../docs/测试文档/首版功能阶段验收与缺陷清单_20261014.md)。

## 当前状态（2026-10-18）

- 公开站：首页、团队、研究、文化；桌面与手机两种视口已检查。
- 内容工作台：新闻、研究方向、论文、项目、成员、媒体库、活动相册、站点设置、账号和操作记录的基础流程可用。
- 新闻编辑：新建时自动生成可调整的 URL 标识；分类由系统默认；核查依据链接和说明均为选填。V3 支持富文本、媒体库封面与正文插图、图注及宽度/对齐设置；站内链接保留相对路径，未保存时离开会提醒。实时与已保存预览同公开详情页共用文章渲染组件。发布前会重新检查图片授权状态，未发布或已撤回内容不可公开访问。
- 正式中文资料：实验室基础信息、三类研究方向名称；团队页含王志锋、刘晓雪、熊宇轩及 20 位在读学生、25 位校友。教师肖像来自华中师范大学教师主页，经媒体库授权后展示。研究页有 4 篇代表论文和 4 项项目。
- 中文新闻：六篇王志锋相关新闻已按公众号发布时间录入、核查、发布，11张配图保存在媒体库；首页按原报道日期从新到旧展示。来源与逐篇采编见[采编方案](../docs/内容文档/王志锋相关新闻采编方案与来源清单_20261018.md)，发布与复现见[验收记录](../docs/测试文档/公众号新闻录入发布与联调验收_20261018.md)。
- 阶段结论：**V3 新闻编辑链路可用于本地试用；尚未达到云端正式发布标准。**活动相册内容、联系渠道、英文译文、列表分页与云端备份部署仍待完成。首页新闻列表暂不展示封面缩略图；富文本编辑器目前只接入新闻模块。

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
| `shared/news-article.js`、`shared/news-article.css` | 后台新闻预览和公开详情页共用的文章结构与排版 |

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
npm start
```

本地默认端口固定为 `3004`。公开站：`http://127.0.0.1:3004/`；内容工作台：`http://127.0.0.1:3004/admin/`；健康检查：`http://127.0.0.1:3004/api/health`。既有本地数据库不需要再次运行管理员初始化脚本。若 Docker Desktop 重启后容器没有自动运行，先启动该容器再访问网站。历史测试文档中的 `3001` 是当时验收使用的端口，不代表当前启动配置。

### 在新数据库恢复本阶段来源内容

完成迁移与管理员初始化，并保持网站服务运行后，在另一个终端设置同一管理员的 `ADMIN_LOGIN`、`ADMIN_PASSWORD`，依次执行：

```powershell
node scripts/import-faculty-profile-20261013.js
node scripts/import-teachers-20261014.js
```

脚本通过管理 API 保存来源、核查和发布记录；重复执行不会重复创建同一批成员及肖像。内容与照片原始链接见[来源记录](../docs/内容文档/王志锋教师主页数据来源与采纳记录_20261013.md)及[新增教师记录](../docs/内容文档/新增教师与肖像来源记录_20261014.md)。

六篇公众号新闻可通过以下命令恢复，原始配图、来源 URL 与 SHA-256 已保存在 `server/seed-media/wechat-news-20261018/`；无需重新访问公众号下载图片。

```powershell
$env:TEST_BASE_URL = 'http://127.0.0.1:3004'
node scripts/import-wechat-news-20261018.js            # 保存草稿后检查后台预览
node scripts/import-wechat-news-20261018.js --publish  # 按原文日期从早到晚核查并发布
```

脚本通过同一管理 API 操作，要求 `ADMIN_LOGIN` 和 `ADMIN_PASSWORD`。相同内容重复执行不会创建重复新闻、图片或修订，也不刷新已发布内容的实际发布时间。如检测到已有新闻与采编稿不同，默认停止；确认需要用采编稿更新后才使用 `--update-existing`，该选项会按当前版本保存新修订。媒体已撤权或停用时也会停止，需在媒体库核对。

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
npm run test:news-media
npm run test:settings
npm run test:accounts
```

测试会创建并撤回本地合成内容；请只对开发数据库运行。V3 图片编辑与浏览器回归见[新闻编辑器修复记录](../docs/测试文档/V3新闻编辑器问题修复与回归_20261015.md)。

修改富文本编辑器源码后，在 `frontend/admin` 执行 `npm ci` 和 `npm run build`，并提交更新后的 `editor.bundle.js`。本地受限沙箱可能阻止 esbuild 子进程读取工作目录；这种情况下应在有正常工作目录访问权限的终端构建。

## 发布前仍需完成

选择云服务器、域名和 HTTPS 反向代理，设置生产密钥与独立账号，演练 PostgreSQL 与 `server/storage/media/` 的备份恢复；补齐真实内容、英文译文、分页和完整可访问性回归。当前 `platform.js` 仅监听本机 `127.0.0.1`，不能直接视为已完成公网部署。
