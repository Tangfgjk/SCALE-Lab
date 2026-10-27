# SCALE Lab

智能学习分析与评价实验室公开网站与内容管理平台。开发分支：`V5-20261020`。

## 当前入口

- 本地网站：<http://127.0.0.1:3004/>
- 本地工作台：<http://127.0.0.1:3004/admin/>
- 公开静态展示：<https://tangfgjk.github.io/SCALE-Lab/>（`gh-pages`，不含后台，内容需重新导出同步）。

## 代码目录

```text
frontend/public/    正式公开网站
frontend/admin/     管理工作台与富文本编辑器源码
frontend/shared/    文章渲染、内容规则等共用浏览器模块
backend/           Express 后端、PostgreSQL 迁移、导入与备份工具、测试
infrastructure/    生产 Docker、HTTPS 反向代理、备份恢复脚本
archive/           旧网页与 JSON 服务器原型，不再作为启动入口
docs/              设计、数据来源、进度与验收
```

正式后端入口：`backend/platform.js`；Express app 在 `backend/app.js`，可独立加载。文档早期记录中的 `frontend/server` 和 `visual-preview-20261013` 为迁移前路径，当前以本说明为准。

## 本地运行

需要 Node.js（生产镜像/CI 使用 24）、Docker 中的 PostgreSQL。本地仍使用现有 `scale-lab-postgres` 容器，5433 端口及原数据库卷不变。

```powershell
npm ci --prefix backend
npm ci --prefix frontend/admin
npm run build
# 连接信息按本地配置设置，不提交 .env 或密码
$env:DATABASE_URL='postgres://用户名:密码@127.0.0.1:5433/scale_lab'
node backend/db/migrate.js
npm start
```

本地端口固定 3004。图片、数据库备份与报告在 `backend/storage`，该目录被 Git 忽略；代码推送不等于资料备份。

## 验证与备份

```powershell
npm run check
# 必须提供全新、名称以 _test 结尾的隔离数据库；禁止指向真实库
$env:DATABASE_URL='postgres://用户名:密码@127.0.0.1:5433/scale_lab_ci_test'
npm test
```

CI 自动执行迁移及重复迁移、编辑器构建、依赖审计、15 组接口回归和独立生产容器验收，不连接本地资料库。写入型旧测试也要求明确的隔离环境。

本地成套备份与恢复使用 `backend/scripts/backup-restore.js`；先停止本站服务及其他数据库连接，再备份。恢复只接受不同且为空的目标数据库和空媒体目录。具体命令及生产操作见以下文档。

## 部署与文档

- [本轮工程化进度与验收](docs/进度文档/V5工程化改造与隔离验收_20261027.md)
- [备份恢复与生产部署手册](docs/运维文档/备份恢复与生产部署手册_20261027.md)
- [架构改进方案](docs/设计文档/V5架构评审核实与工程化改进方案_20261027.md)
- [GitHub Pages 更新说明](docs/进度文档/GitHub_Pages公开展示版部署与更新说明_20261027.md)
- [文档索引](docs/文档索引_20261013.md)

当前没有云服务器，已完成生产配置与本地容器演练，不代表完成真实域名、HTTPS、云备份或公网安全验收。生产启动会拒绝演示弱口令及缺失配置，不能直接把本地账号用于公网。
