# Notion 页面内容展示器

本地项目：定时从 Notion 拉取指定 page 的 Markdown，有更新时用 TypeIt 按段打字机展示；支持更换背景图（保存到项目目录）。

## 运行

1. 复制环境变量并填写 Notion 配置：
   ```bash
   cp .env.example .env
   # 编辑 .env：NOTION_API_TOKEN、NOTION_PAGE_URL 或 NOTION_PAGE_ID
   ```

2. 仅后端（前端需先构建或单独起 Vite）：
   ```bash
   npm run build   # 可选：构建前端到 dist
   npm run dev     # 启动 Node 服务，默认 http://localhost:3000
   ```

3. 开发时同时跑前端与后端（推荐）：
   ```bash
   npm run dev:full
   ```
   前端：http://localhost:5173（Vite 代理 /api 与 /background.jpg 到 3000）  
   后端：http://localhost:3000

## 配置说明

- `NOTION_API_TOKEN`：必填；Notion 集成 Token。
- `NOTION_PAGE_URL` 或 `NOTION_PAGE_ID`：必填其一。URL 示例：`https://www.notion.so/Reporter-Dash-3049166fd9fd80d0b8ecc9b2f87705c1`。
- `POLL_INTERVAL_MS`：轮询间隔（毫秒），默认 60000。
- `PORT`：后端端口，默认 3000。

## 验收

- 配置 Token 与 page 后，能定时拉取该 page 内容并以打字机效果展示。
- 内容有更新时，先清空再重新打字机展示；无更新不打断。
- 页面有背景图；点击「更换背景」上传图片后，新图保存到 `public/background.jpg` 并生效。
