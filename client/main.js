/**
 * 前端：轮询 /api/page-content，内容变更时清空并用 TypeIt 按段打字机展示；
 * 背景图使用 /background.jpg，支持上传更换。
 */
import TypeIt from 'typeit';
import { marked } from 'marked';

// 配置：API 与轮询间隔（与后端 .env 一致或前端覆盖）
const API_BASE = '';
const POLL_INTERVAL_MS = Number(window.__POLL_INTERVAL_MS__) || 60000;
const TYPE_SPEED = 80;
const NEXT_STRING_DELAY = 200;

const container = document.getElementById('typewriter-container');
const bgFileInput = document.getElementById('bg-file');

let lastContentHash = '';
let typeItInstance = null;

/**
 * 将整页 Markdown 按段拆分（双换行为一段），每段转 HTML。
 */
function markdownToHtmlSegments(markdown) {
  if (!markdown || !markdown.trim()) return [];
  const segments = markdown.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  return segments.map((seg) => marked.parse(seg));
}

/**
 * 在 container 内用 TypeIt 按段打出 HTML；若有旧实例则先清空再创建。
 */
function runTypewriter(htmlSegments) {
  if (!container) return;
  container.innerHTML = '';
  const target = document.createElement('div');
  target.className = 'typewriter-target';
  container.appendChild(target);
  if (typeItInstance != null) {
    try {
      if (typeof typeItInstance.destroy === 'function') typeItInstance.destroy();
    } catch (_) {}
    typeItInstance = null;
  }
  if (htmlSegments.length === 0) {
    target.textContent = '（无内容）';
    return;
  }
  typeItInstance = new TypeIt(target, {
    strings: htmlSegments,
    html: true,
    breakLines: true,
    speed: TYPE_SPEED,
    nextStringDelay: NEXT_STRING_DELAY,
  });
  typeItInstance.go();
}

/**
 * 拉取一次 page-content；若 contentHash 变化则清空并重新打字机展示。
 */
async function fetchAndUpdate() {
  try {
    const res = await fetch(`${API_BASE}/api/page-content`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      runTypewriter([]);
      if (container) container.innerHTML = `<p class="error">${err.error || res.statusText}</p>`;
      return;
    }
    const { markdown, contentHash } = await res.json();
    if (contentHash !== lastContentHash) {
      lastContentHash = contentHash;
      const segments = markdownToHtmlSegments(markdown);
      runTypewriter(segments);
    }
  } catch (e) {
    if (container) container.innerHTML = `<p class="error">请求失败: ${e.message}</p>`;
  }
}

/**
 * 轮询：首次立即拉取，之后按间隔定时拉取。
 */
function startPolling() {
  fetchAndUpdate();
  setInterval(fetchAndUpdate, POLL_INTERVAL_MS);
}

/**
 * 背景图：使用 <img> + object-fit: cover，由浏览器按比例缩放，绝不拉伸。
 */
function getBgImage() {
  return document.getElementById('bg-image');
}

function initBackground() {
  const img = getBgImage();
  if (img) img.src = `${API_BASE}/background.jpg?t=${Date.now()}`;
}

function updateBackgroundUrl() {
  const img = getBgImage();
  if (img) img.src = `${API_BASE}/background.jpg?t=${Date.now()}`;
}

/**
 * 上传背景图：POST /api/background，成功后更新页面背景。
 */
async function uploadBackground(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const form = new FormData();
  form.append('file', file);
  try {
    const res = await fetch(`${API_BASE}/api/background`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || '上传失败');
      return;
    }
    const data = await res.json();
    if (data.url) updateBackgroundUrl();
  } catch (e) {
    alert('上传失败: ' + e.message);
  }
}

if (container) {
  container.textContent = '加载中…';
  startPolling();
}
initBackground();
if (bgFileInput) {
  bgFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) uploadBackground(file);
    e.target.value = '';
  });
}
