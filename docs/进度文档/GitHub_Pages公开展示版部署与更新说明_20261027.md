# GitHub Pages 公开展示版部署与更新说明

日期：2026-10-27。

后续工程化已将 `frontend/server` 移为 `backend`、正式公开站移为 `frontend/public`。下文旧路径是首次部署记录；现在从 `backend` 执行相同脚本，输出为 `backend/storage/pages-preview`，导出已兼容公开接口分页与静态筛选。

## 访问地址与范围

https://tangfgjk.github.io/SCALE-Lab/

用途：向导师、同学分享目前网站的效果。访客可以浏览首页、团队成员及详情、研究成果、新闻及全文、实验室文化与活动全文、加入我们。保留原有配色、移动端菜单、回到顶部、语言切换及首次访问开屏动画。英文展示遵循本地已发布英文内容，不自动翻译或补发草稿。

这是公开访问链接，没有访客登录限制。展示版只包含匿名公开接口返回的内容与公开可访问的图片；没有管理后台、账号、会话、数据库备份及草稿。电脑关闭后仍然可以访问。

## 架构与隔离

- 开发分支保持 `V5-20261020`，本轮不将工作区此前的视觉改动自动提交到开发分支。
- 部署分支为 `gh-pages`，仅包含静态网站。首次部署提交为 `41739168731fb836b5d401f8a357e0c6daf48c85`。
- GitHub Pages 使用该分支根目录，构建状态为 `built`。
- `frontend/server/scripts/export-pages.js` 从本地 `http://127.0.0.1:3004` 的公开 API 导出，生成目录 `frontend/server/storage/pages-preview` 已被 storage 忽略规则覆盖。
- 导出涵盖中文、英文的站点设置、研究方向、论文、项目、新闻、活动和成员列表，以及对应公开详情。首次共 71 份接口快照、51 张去重公开图片，静态包约 7.24 MB。
- `snapshot-runtime.js` 将原前端 GET 请求解析为本地 `snapshot-data.json` 的公开快照。未导出的详情返回 404，不回连本地后端。
- `/shared/` 改为相对路径；富文本渲染器仅在导出产物中增加同源当前站点目录下 UUID 图片文件的校验；开屏首页判断兼容 `/SCALE-Lab/`。这些修改不改变本地正式站和工作台。
- `publish-pages.js` 使用 storage 内独立 Git 元数据推送静态快照，不切换开发分支、不替换当前索引、不使用强制推送。
- `pages-github.js` 通过现有 Git Credential Manager 会话查询 Pages 状态；仅在明确传入 `--enable` 时创建 Pages。已有不同的部署配置不会自动覆盖。凭据不会写入产物和日志。

## 更新步骤

先在本地后台编辑并发布内容，确认本地网站效果。启动本地项目与 PostgreSQL 后，在 `frontend/server` 中依次运行：

```powershell
node scripts/export-pages.js
# 验证导出页面和公开内容，确认无误后：
node scripts/publish-pages.js
node scripts/pages-github.js
```

首次启用或配置不存在时才执行：

```powershell
node scripts/pages-github.js --enable
```

本地后台保存、发布、撤回或停用图片，不会自动更新 GitHub Pages。需要重新导出并推送，之后还需等待 GitHub 构建与浏览器/CDN缓存刷新。因此若撤回某篇文章或某张图，必须同步更新展示版。不能将它作为实时管理系统使用。

源代码的更新仍按开发分支正常提交推送；部署分支只保存导出结果。动态平台后续迁移到云服务器时，还需迁移数据库和上传文件。

## 验收记录

- 本地以 `/SCALE-Lab/` 子目录静态服务验收，7 个页面入口（含成员详情）及新闻详情通过，无脚本错误、资源 404、坏图或桌面横向溢出。
- 390px 手机首页无横向溢出，活动卡片可点击。
- 实际新闻详情可读、正文图片正常；毕业活动详情 5 张图片加载成功。
- 新浏览器上下文首次进入子目录首页播放开屏，刷新后不重复播放。
- 线上浏览器访问首页确认最新新闻 3 条、活动 2 条；点击毕业活动进入全文，5 张图片正常，无脚本或 HTTP 错误。
- GitHub Pages 公网首页 HTTP 200；线上清单与本地快照 SHA-256 一致：`f479159444a967b98b047e7aa6f5c6762aa6da2528a3a985a82e517f8a4bf911`。
- 当前网络直接浏览器连接一度中断，通过现有系统代理后线上浏览验证成功；不同网络的访问速度可能有差异。

## 官方参考

- [GitHub Pages 简介](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Pages 配置接口](https://docs.github.com/en/rest/pages/pages)
