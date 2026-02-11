# Feature Implementation Plan

**Overall Progress:** `100%`

## TLDR

本地项目：浏览器 + Node 后端。定时从 Notion 拉取指定 page 的 Markdown 内容，有更新时清空并用 TypeIt 按段打字机展示；页面带可更换背景图，上传后由后端保存到项目目录并替换。

## Critical Decisions

- **架构**：浏览器 + 本地 Node 后端（Notion 与 token 仅在后端，避免 CORS 与泄露）。
- **Page ID**：支持配置「Notion 页面 URL」或「32 位 page ID」；从 URL 取 pathname 最后一段 32 位，调 API 前格式化为带连字符的 UUID（8-4-4-4-12）。
- **Notion 封装**：参考现有 notion.ts，只保留 getPageBlocks + blocks→Markdown，不整份拷贝。
- **变更判断**：对整页 Markdown 做 hash，与上次比较；有变化则清空再重新打字机展示。
- **打字机**：TypeIt 现成组件 + marked；按段拆 Markdown→每段转 HTML→strings 数组传入 TypeIt（html: true, breakLines: true）。
- **背景图**：上传走后端接口，写入项目目录（如 public/），前端用固定 URL 加载；支持在界面更换。
- **适配**：桌面 + 手机，响应式布局（背景全屏、文字可读）。

## Tasks

- [x] 🟩 **Step 1: 项目骨架与环境**
  - [x] 🟩 初始化前端（Vite + 简单 HTML/JS），可配置 base URL 请求后端
  - [x] 🟩 初始化 Node 后端（Express），提供静态资源与 API 路由占位
  - [x] 🟩 添加 .env 支持：NOTION_API_TOKEN、NOTION_PAGE_URL 或 NOTION_PAGE_ID、轮询间隔、可选端口

- [x] 🟩 **Step 2: Page ID 解析与 Notion 薄封装**
  - [x] 🟩 实现 page ID 解析：URL 时取 pathname 最后一段 32 位；32 位字符串直接使用；格式化为带连字符 UUID（8-4-4-4-12）
  - [x] 🟩 后端薄封装：仅 getPageBlocks(pageId) + blocks→Markdown（server/notion.js），不引入全量 notion.ts

- [x] 🟩 **Step 3: 后端 API — page-content 与变更判断**
  - [x] 🟩 GET /api/page-content：接受 query 或 env 的 pageUrl/pageId，解析后 getPageBlocks→blocksToMarkdown
  - [x] 🟩 对 Markdown 计算 contentHash（sha256），响应返回 { markdown, contentHash }
  - [x] 🟩 轮询间隔由前端/环境配置，后端仅负责单次拉取与 hash

- [x] 🟩 **Step 4: 后端 API — 背景图上传**
  - [x] 🟩 POST /api/background：multer 接收图片，写入 public/background.jpg，返回 { url: '/background.jpg?...' }
  - [x] 🟩 静态中间件托管 public/，前端可访问 /background.jpg

- [x] 🟩 **Step 5: 前端 — 轮询与变更判断**
  - [x] 🟩 定时请求 GET /api/page-content（POLL_INTERVAL_MS，默认 60s），拿到 { markdown, contentHash }
  - [x] 🟩 contentHash 与上次比较：相同不操作；不同则清空展示区并用新 markdown 驱动 TypeIt

- [x] 🟩 **Step 6: 前端 — 打字机（TypeIt + 按段 Markdown→HTML）**
  - [x] 🟩 引入 typeit、marked；整页 markdown 按 \n\n+ 拆段，每段 marked.parse 为 HTML
  - [x] 🟩 strings: [html1, ...] 传入 TypeIt，html: true、breakLines: true、speed/nextStringDelay 可配置
  - [x] 🟩 内容更新时清空 container、创建新目标节点并 runTypewriter(segments)

- [x] 🟩 **Step 7: 前端 — 背景图展示与更换**
  - [x] 🟩 页面加载时 body 使用 /background.jpg（带 cache-bust 参数）全屏展示
  - [x] 🟩 「更换背景」上传 → POST /api/background → 成功后更新 backgroundImage URL（?t=timestamp）

- [x] 🟩 **Step 8: 桌面与手机适配**
  - [x] 🟩 背景图 cover/center、文字区居中可读、字体与间距相对单位（clamp）
  - [x] 🟩 小屏 ≤768px 媒体查询，避免文字过小与溢出
