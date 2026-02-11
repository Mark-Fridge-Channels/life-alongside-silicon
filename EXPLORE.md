# 探索报告：Notion 页面内容展示器

基于 **ISSUE.md** 与参考文件 **notion.ts** 的梳理，不含实现，仅做依赖、集成与待澄清项说明。

---

## 1. 现有参考（notion.ts）与 Issue 的对应关系

### 1.1 获取 Page 内容

- Issue 要求：定时获取**某一个 page 的内容**。
- **notion.ts 中可直接复用的能力：**
  - **`getPageBlocks(pageId)`**（约 328–334 行）：递归拉取该 page 下所有 block（含子块），是「page 内容」的唯一来源。  
    - 注意：`getPage(pageId)` 只拿 page 元数据（properties 等），**不包含正文 blocks**，正文必须用 `getPageBlocks`。
  - **`blocksToMarkdown(blocks)`**（约 413–420 行）：把 blocks 转成整页 Markdown 字符串，适合作为「展示 + 变更比对」的统一格式。
  - 若只要纯文本：可用 **`extractBlockText(block)`** 逐 block 提取后拼接，或自写一个 `blocksToPlainText(blocks)`。

- **运行环境**：notion.ts 使用 `process.env` 和 `@notionhq/client`，只能在 **Node** 环境运行。浏览器不能直接调 Notion API（CORS + 不能暴露 token），因此必须有一层**本地后端或构建时/开发时代理**（与 Issue 中 CORS 风险一致）。

### 1.2 变更判断

- Issue：每次拉取后**先判断内容有没有更新**，有更新再清空并重新打字机展示。
- 实现方式：对「当前用于展示的字符串」（如 `blocksToMarkdown()` 或 `blocksToPlainText()` 的结果）做 **hash**（如 SHA256 或简单 hash），与上次保存的 hash 比较即可。无需 block 级 diff，满足「有更新则整页重打」即可。

### 1.3 打字机效果

- 输入：上面得到的一整段**字符串**（纯文本或 Markdown）。
- 若展示为**纯文本**：按字符或按句定时追加到 DOM 即可。
- 若展示为 **Markdown**：有两种常见做法：
  - **A**：先按字符/段打出「原始 Markdown 字符串」，再交给 Markdown 渲染（打完后或实时渲染），实现简单但打字过程中用户会看到 Markdown 符号。
  - **B**：按「块/段落」为单位打，每打一段就渲染成 HTML，体验更好，实现稍复杂（需解析 Markdown 或直接用 block 流）。
- **已确认**：采用 **Markdown，按段打出并实时渲染**。

### 1.4 背景图与「保存到本地」

- Issue：页面有背景图、支持更换、**上传的图片保存到本地并替换**。
- 约束：
  - **浏览器无法直接写磁盘**。所谓「保存到本地」只能是下列之一：
    - **方案 A**：项目带一个**本地 Node 服务**（或 Vite/Next 等 dev + API）：上传接口把图片写到项目目录（如 `public/bg.jpg` 或 `uploads/`），前端通过 URL 使用；下次打开仍是同一张图。
    - **方案 B**：**纯前端**：图片用 FileReader 读成 Data URL / Blob，存 **localStorage / IndexedDB**，下次打开从存储恢复；没有持久化到「项目文件夹」。
  - **已确认**：**保存到本地** = 写入项目目录（浏览器上传 → 后端接口 → 保存到 `public/` 或指定目录，下次从同一路径加载）。

### 1.5 Page ID 格式（已调研）

- **URL 示例**：`https://www.notion.so/Reporter-Dash-3049166fd9fd80d0b8ecc9b2f87705c1`
- **规则**：Notion 页面 ID 是 URL 中**最后一段的 32 位十六进制字符串**（不含连字符）。  
  - 从该 URL 解析得到：`3049166fd9fd80d0b8ecc9b2f87705c1`  
  - 前面的 `Reporter-Dash-` 是页面标题的 slug，不能传给 API。
- **API 要求**：Notion 官方文档与社区示例表明，**Retrieve a page** 与 **Retrieve block children** 的 `page_id` / `block_id` 需为 **带连字符的 UUID** 格式（8-4-4-4-12）。  
  - 32 位无连字符 → 带连字符：`3049166fd9fd80d0b8ecc9b2f87705c1` → `3049166f-d9fd-80d0-b8ec-c9b2f87705c1`
- **实现约定**：  
  - 配置项支持「**Notion 页面 URL**」或「**32 位 page ID**」。  
  - 若传入的是 URL：从 pathname 取最后一段（`/Reporter-Dash-3049166fd9fd80d0b8ecc9b2f87705c1` → `3049166fd9fd80d0b8ecc9b2f87705c1`），若长度为 32 则视为 page ID；再格式化为带连字符的 UUID 再调 API。  
  - 若传入的是 32 位字符串：直接格式化为带连字符的 UUID 再调 API。  
  - **32 位 → UUID**：`s.slice(0,8) + '-' + s.slice(8,12) + '-' + s.slice(12,16) + '-' + s.slice(16,20) + '-' + s.slice(20,32)`（例如 `3049166fd9fd80d0b8ecc9b2f87705c1` → `3049166f-d9fd-80d0-b8ec-c9b2f87705c1`）。  
  - 参考：[Retrieve a page](https://developers.notion.com/reference/retrieve-a-page)、[Get block children](https://developers.notion.com/reference/get-block-children)、[如何从 URL 提取 Page ID](https://stackoverflow.com/questions/68869499/how-to-get-the-page-id-from-a-public-notion-page-url-without-querying-a-database)。

---

## 2. 技术结构与依赖

- **Notion 调用**：必须跑在 Node 侧（复用 notion.ts 或等价逻辑），依赖 `@notionhq/client` 和 `NOTION_API_TOKEN`（以及可选 `NOTION_TOKEN`）。
- **前端**：需要定时触达「拉取内容」的接口（轮询间隔可配置）、接收「文本/Markdown + 是否变更」、驱动打字机与背景图。
- **已确认架构**：**浏览器 + 本地 Node 后端**  
  - 后端：提供 `GET /api/page-content`（接受 URL 或 pageId，内部解析 page ID、调 `getPageBlocks` + `blocksToMarkdown`、hash 比较）、`POST /api/background` 上传背景图并写入项目目录（如 `public/`）。  
  - 前端：定时请求 `/api/page-content`，根据返回做变更判断与打字机；背景图通过上传接口 + 固定 URL 使用。
- **已确认适配**：**桌面 + 手机**。背景图全屏、文字区域可读、响应式布局（viewport + 相对单位），需兼顾小屏（如 768px 及以下）与桌面。

---

## 3. 边界与约束（简要）

- **Notion 限流**：轮询间隔建议可配置，默认 ≥ 1 分钟，避免频繁请求。
- **子页面**：`getPageBlocks` 只包含当前 page 的 block 树，不包含 Notion 里的「子页面」（subpage）。若该 page 内有链接到其他 page，不会自动展开，与当前「单 page 内容展示」需求一致。
- **图片/表格等**：notion.ts 的 `blockToMarkdown` 已处理 image/table/code 等，若展示用 Markdown，这些会以 Markdown 形式出现；若只做纯文本，可用 `extractBlockText`，表格/图片会变成少量占位或省略，需接受这种简化。
- **Token**：仅环境变量，不提交仓库、不写进前端代码。

---

## 4. 已确认选型汇总

| 项 | 选择 |
|----|------|
| 运行形态 | 浏览器 + 本地 Node 后端 |
| 背景图保存 | 写入项目目录（后端接收上传并保存，如 `public/`） |
| 展示格式 | Markdown，**按段打出并实时渲染** |
| 适配 | 桌面 + 手机（响应式，兼顾小屏与桌面） |
| notion.ts | 仅作参考，新项目**只保留用到的能力**（getPageBlocks + blocks 转 Markdown，不整份拷贝） |
| Page ID | 从 URL 解析：取 pathname 最后一段 32 位为 page ID，调 API 时格式化为带连字符的 UUID（见 1.5） |

---

## 5. 打字机效果实现方式（调研）

需求：**Markdown 按段打出并实时渲染**（每打一段就渲染成 HTML）；**使用现成组件，不手写打字逻辑**。

### 选定方案：TypeIt（现成组件）

采用 **[TypeIt](https://www.typeitjs.com/)** 作为打字机实现，不自己写 setInterval/requestAnimationFrame。

- **官网 / 文档**：[typeitjs.com](https://www.typeitjs.com/) · [Docs](https://typeitjs.com/docs)
- **npm**：`typeit`（无 React/Vue 官方封装，在任意前端框架中通过 ref/容器在 mount 后初始化即可）
- **能力**：
  - 支持 **多段**：`strings: [ "第一段", "第二段", ... ]`，配合 `breakLines: true` 多段逐段打出、不覆盖。
  - 支持 **HTML**：`html: true` 时，传入的字符串会按 HTML 解析并渲染（如 `'Hello <strong>world</strong>'` 会显示为加粗的 world），而不是逐字打出标签。
- **与「按段 + 实时渲染」的配合**：
  1. 后端返回整页 **Markdown**，前端按段拆分（如 `\n\n` 或 Markdown 块解析）。
  2. 每段用 **Markdown 库**（如 [marked](https://github.com/markedjs/marked) / [markdown-it](https://github.com/markdown-it/markdown-it)）转成 **HTML**。
  3. 将得到的 **HTML 字符串数组** 传给 TypeIt：`new TypeIt('#container', { strings: [html1, html2, ...], html: true, breakLines: true, speed: 80, nextStringDelay: 200 }).go()`。
  4. TypeIt 会按段逐字打出，且每段内容以**已渲染的 HTML** 显示（标题、加粗、列表等），即「按段打出并实时渲染」，无需手写打字逻辑。

### 其他现成组件简要对比

| 组件 | 说明 | 与本需求 |
|------|------|----------|
| **react-effect-typewriter** | React：`Paragraph` + `Container`，按字符打字、多段顺序。 | 只打**纯文本**，不解析 HTML/Markdown；若要做富文本需自己拼 DOM，不如直接用 TypeIt。 |
| **shadcn Typing Text** | React 文案动画组件。 | 多为单段、固定文案，不适合「动态多段 + Markdown 转 HTML」。 |
| **Vue 系 typewriter** | 如 vue-typewriter、@btjspr/vue-typewriter。 | 多为单段或纯文本，无「按段 + HTML 渲染」开箱支持。 |

结论：**TypeIt** 是当前最贴合「现成组件 + 按段 + 富文本/Markdown 实时渲染」的方案。

### 依赖小结

- **打字机**：`typeit`（现成组件，不手写 JS 打字逻辑）。
- **Markdown → HTML**：`marked` 或 `markdown-it`（仅用于把每段转成 HTML 再交给 TypeIt）。
- **分段**：可用简单规则（如 `\n\n`）或 Markdown 词法/块解析，逻辑极简，不视为「手写打字机」。

---

## 6. 实现前无待澄清项

以上已足以拆分任务并实现。建议实现顺序：**Page ID 解析与 Notion 薄封装 → 后端 API（page-content + background 上传）→ 前端轮询与变更判断 → 打字机（TypeIt + 按段 Markdown→HTML）→ 背景图上传与替换 → 桌面/手机适配**。
