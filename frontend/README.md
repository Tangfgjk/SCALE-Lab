# 前端

- `public/`：当前公开网站，原生 HTML/CSS/JS。
- `admin/`：内容工作台，Tiptap 编辑器，执行 `npm ci`、`npm run build` 构建。
- `shared/`：公开站和工作台共用的文章渲染及字段规则。

后端已移至根目录 `backend/`，统一通过根目录 `npm start` 在 3004 端口运行。不要单独将 HTML 当作完整动态网站运行。启动、测试、备份和部署见根目录 README。
