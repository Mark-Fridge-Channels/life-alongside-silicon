/**
 * Notion 薄封装：仅 getPageBlocks + blocks→Markdown。
 * Page ID 支持：Notion 页面 URL 或 32 位 ID；调 API 前格式化为带连字符的 UUID。
 */
const NOTION_VERSION = '2022-06-28';

/**
 * 将 32 位十六进制字符串格式化为带连字符的 UUID（8-4-4-4-12）。
 * @param {string} s - 32 位字符串
 * @returns {string} 例如 3049166f-d9fd-80d0-b8ec-c9b2f87705c1
 */
export function toUUID(s) {
  if (!s || typeof s !== 'string') return '';
  const t = s.replace(/-/g, '').trim();
  if (t.length !== 32) return s;
  return `${t.slice(0, 8)}-${t.slice(8, 12)}-${t.slice(12, 16)}-${t.slice(16, 20)}-${t.slice(20, 32)}`;
}

/**
 * 从配置解析出可用于 Notion API 的 page_id（带连字符的 UUID）。
 * @param {string} pageUrlOrId - Notion 页面 URL（如 https://www.notion.so/Reporter-Dash-3049166fd9fd80d0b8ecc9b2f87705c1）或 32 位 page ID
 * @returns {string|null} UUID 或 null
 */
export function parsePageId(pageUrlOrId) {
  if (!pageUrlOrId || typeof pageUrlOrId !== 'string') return null;
  const raw = pageUrlOrId.trim();
  let id32 = raw;
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const pathname = new URL(raw).pathname;
      const lastSegment = pathname.split('/').filter(Boolean).pop() || '';
      // 最后一段可能为 "Reporter-Dash-3049166fd9fd80d0b8ecc9b2f87705c1"，取末尾 32 位
      id32 = lastSegment.length >= 32 ? lastSegment.slice(-32) : lastSegment;
    } else {
      id32 = raw.replace(/-/g, '');
    }
  } catch (_) {
    id32 = raw.replace(/-/g, '');
  }
  if (id32.length !== 32 || !/^[a-f0-9]+$/i.test(id32)) return null;
  return toUUID(id32);
}

/**
 * 递归获取某 block 的全部子块（分页 + 子块展开）。
 */
async function getBlockChildren(blockId, token) {
  const children = [];
  let cursor;
  do {
    const resp = await fetch(
      `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
        },
      }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `Notion API ${resp.status}`);
    }
    const data = await resp.json();
    const blocks = data.results || [];
    for (const block of blocks) {
      if (block.has_children) {
        block.children = await getBlockChildren(block.id, token);
      }
      children.push(block);
    }
    cursor = data.next_cursor;
  } while (cursor);
  return children;
}

/**
 * 获取页面的所有内容块（page 的 block_id 即 page_id）。
 * @param {string} pageId - 带连字符的 UUID
 * @param {string} token - NOTION_API_TOKEN
 * @returns {Promise<any[]>} blocks 数组
 */
export async function getPageBlocks(pageId, token) {
  if (!token) throw new Error('NOTION_API_TOKEN is required');
  return getBlockChildren(pageId, token);
}

function richTextToMarkdown(richText) {
  if (!richText || !Array.isArray(richText)) return '';
  return richText
    .map((item) => {
      let text = item.plain_text || '';
      const a = item.annotations || {};
      if (a.bold) text = `**${text}**`;
      if (a.italic) text = `*${text}*`;
      if (a.strikethrough) text = `~~${text}~~`;
      if (a.code) text = `\`${text}\``;
      if (item.href) text = `[${text}](${item.href})`;
      return text;
    })
    .join('');
}

function blockToMarkdown(block, depth = 0) {
  if (!block) return '';
  const type = block.type;
  const data = block[type] || {};
  const indent = '  '.repeat(depth);
  let md = '';
  switch (type) {
    case 'paragraph':
      md = richTextToMarkdown(data.rich_text || []);
      break;
    case 'heading_1':
      md = `# ${richTextToMarkdown(data.rich_text || [])}`;
      break;
    case 'heading_2':
      md = `## ${richTextToMarkdown(data.rich_text || [])}`;
      break;
    case 'heading_3':
      md = `### ${richTextToMarkdown(data.rich_text || [])}`;
      break;
    case 'bulleted_list_item':
      md = `${indent}- ${richTextToMarkdown(data.rich_text || [])}`;
      break;
    case 'numbered_list_item':
      md = `${indent}1. ${richTextToMarkdown(data.rich_text || [])}`;
      break;
    case 'to_do':
      md = `${indent}- [${data.checked ? 'x' : ' '}] ${richTextToMarkdown(data.rich_text || [])}`;
      break;
    case 'toggle':
      md = `${indent}- ${richTextToMarkdown(data.rich_text || [])}`;
      break;
    case 'code':
      md = `\`\`\`${data.language || ''}\n${richTextToMarkdown(data.rich_text || [])}\n\`\`\``;
      break;
    case 'quote':
      md = `> ${(richTextToMarkdown(data.rich_text || [])).split('\n').join('\n> ')}`;
      break;
    case 'callout':
      md = `> ${data.icon?.emoji || '💡'} ${(richTextToMarkdown(data.rich_text || [])).split('\n').join('\n> ')}`;
      break;
    case 'divider':
      md = '---';
      break;
    case 'table':
      if (block.children?.length) {
        const rows = [];
        let first = true;
        for (const row of block.children) {
          if (row.type !== 'table_row') continue;
          const cells = (row.table_row?.cells || row[row.type]?.cells || []).map((c) => richTextToMarkdown(c || []));
          if (cells.length) {
            rows.push(`| ${cells.join(' | ')} |`);
            if (first) {
              rows.push(`| ${cells.map(() => '---').join(' | ')} |`);
              first = false;
            }
          }
        }
        md = rows.length ? '\n' + rows.join('\n') + '\n' : '\n[表格]\n';
      } else md = '\n[表格]\n';
      break;
    case 'image':
      md = `![${richTextToMarkdown(data.caption || []) || 'image'}](${(data.file?.url || data.external?.url) || ''})`;
      break;
    case 'video':
    case 'file':
      md = `[${type}](${(data.file?.url || data.external?.url) || ''})`;
      break;
    case 'bookmark':
      md = `[${richTextToMarkdown(data.caption || []) || data.url}](${data.url || ''})`;
      break;
    case 'link_preview':
      md = `[链接](${data.url || ''})`;
      break;
    case 'equation':
      md = `$${data.expression || ''}$`;
      break;
    default:
      md = data.rich_text ? richTextToMarkdown(data.rich_text) : `[${type}]`;
  }
  if (type !== 'table' && block.children?.length) {
    const childMd = block.children.map((c) => blockToMarkdown(c, depth + 1)).filter((s) => s.trim()).join('\n');
    if (childMd) md = md ? `${md}\n${childMd}` : childMd;
  }
  return md;
}

/**
 * 将 blocks 数组转为整页 Markdown 字符串。
 */
export function blocksToMarkdown(blocks) {
  if (!blocks || !Array.isArray(blocks)) return '';
  return blocks.map((b) => blockToMarkdown(b)).filter((s) => s.trim()).join('\n\n');
}
