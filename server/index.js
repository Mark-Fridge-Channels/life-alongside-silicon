/**
 * 本地 Node 后端：提供 /api/page-content、/api/background，并托管前端静态资源。
 * Notion 与 token 仅在此运行，避免 CORS 与泄露。
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { parsePageId, getPageBlocks, blocksToMarkdown } from './notion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;

// 静态：上传的背景图与前端构建产物
const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
app.use(express.static(publicDir));

// 生产时前端构建到 dist，由本服务托管
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

app.use(cors());
app.use(express.json());

const token = process.env.NOTION_API_TOKEN || process.env.NOTION_TOKEN || '';
const pageUrl = process.env.NOTION_PAGE_URL || '';
const pageIdRaw = process.env.NOTION_PAGE_ID || '';

/** GET /api/page-content?pageUrl=... 或 ?pageId=... — 拉取 Notion 页 Markdown 并返回 contentHash */
app.get('/api/page-content', async (req, res) => {
  try {
    const pageUrlOrId = req.query.pageUrl || req.query.pageId || pageUrl || pageIdRaw;
    if (!pageUrlOrId) {
      return res.status(400).json({ error: 'Missing pageUrl or pageId (query or env NOTION_PAGE_URL / NOTION_PAGE_ID)' });
    }
    if (!token) {
      return res.status(500).json({ error: 'NOTION_API_TOKEN not set' });
    }
    const pageId = parsePageId(pageUrlOrId);
    if (!pageId) {
      return res.status(400).json({ error: 'Invalid pageUrl or pageId' });
    }
    const blocks = await getPageBlocks(pageId, token);
    const markdown = blocksToMarkdown(blocks);
    const contentHash = crypto.createHash('sha256').update(markdown).digest('hex');
    res.json({ markdown, contentHash });
  } catch (e) {
    console.error('/api/page-content', e);
    res.status(500).json({ error: e.message || 'Failed to fetch page content' });
  }
});

/** 背景图上传：写入 public/background.jpg，返回可访问 URL */
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, publicDir),
    filename: (_req, _file, cb) => cb(null, 'background.jpg'),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\//.test(file.mimetype);
    cb(null, !!ok);
  },
});
app.post('/api/background', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file (use field name "file")' });
  }
  res.json({ url: '/background.jpg?' + Date.now() });
});

// SPA fallback
app.get('*', (req, res) => {
  const index = path.join(distDir, 'index.html');
  if (fs.existsSync(index)) {
    res.sendFile(index);
  } else {
    res.send('Run "npm run build" then "npm run dev", or use Vite dev server with proxy.');
  }
});

app.listen(PORT, () => {
  console.log(`Server at http://localhost:${PORT}`);
});
