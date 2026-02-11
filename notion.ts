/**
 * Notion API 客户端封装
 * 提供通用的数据库查询、创建、更新等操作方法
 * 使用 @notionhq/client 作为底层实现
 */

import { Client } from '@notionhq/client'

export interface NotionQueryOptions {
  page_size?: number
  start_cursor?: string
  filter?: any
  sorts?: Array<{
    property: string
    direction: 'ascending' | 'descending'
  }>
}

export interface NotionPageProperties {
  [key: string]: any
}

export class NotionClient {
  private client: Client

  constructor(apiToken?: string) {
    // 支持 NOTION_TOKEN 或 NOTION_API_TOKEN 环境变量
    const token = apiToken || process.env.NOTION_TOKEN || process.env.NOTION_API_TOKEN || ''
    if (!token) {
      throw new Error('NOTION_TOKEN or NOTION_API_TOKEN is required')
    }
    this.client = new Client({ auth: token })
  }

  /**
   * 查询数据库
   * @param databaseId 数据库 ID
   * @param options 查询选项
   */
  async queryDatabase(databaseId: string, options: NotionQueryOptions = {}) {
    const { page_size = 100, start_cursor, filter, sorts } = options

    try {
      // 首先尝试使用官方客户端方法
      if (this.client && typeof (this.client as any).databases?.query === 'function') {
        try {
          const queryParams: any = {
            database_id: databaseId,
            page_size,
          }
          
          if (start_cursor) {
            queryParams.start_cursor = start_cursor
          }
          
          if (filter) {
            queryParams.filter = filter
          }
          
          if (sorts) {
            queryParams.sorts = sorts
          }

          return await (this.client as any).databases.query(queryParams)
        } catch (clientError: any) {
          // 如果官方方法失败，回退到 fetch
          console.warn('Notion client method failed, falling back to fetch:', clientError.message)
        }
      }

      // 回退到使用 fetch 调用 Notion API
      const body: any = {
        page_size,
      }
      
      if (start_cursor) {
        body.start_cursor = start_cursor
      }
      
      if (filter) {
        body.filter = filter
      }
      
      if (sorts) {
        body.sorts = sorts
      }

      const token = process.env.NOTION_TOKEN || process.env.NOTION_API_TOKEN || ''
      
      if (!token) {
        throw new Error('NOTION_TOKEN or NOTION_API_TOKEN environment variable is not set. Please check your .env.local file.')
      }

      const url = `https://api.notion.com/v1/databases/${databaseId}/query`
      
      let response: Response
      try {
        // 使用最新的 Notion API 版本，并添加缓存控制
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
          body: JSON.stringify(body),
          cache: 'no-store', // 禁用 fetch 缓存
        })
      } catch (fetchError: any) {
        // 捕获网络错误（如连接失败、DNS 解析失败等）
        const errorMessage = fetchError.message || 'Network request failed'
        const errorCause = fetchError.cause ? ` (cause: ${fetchError.cause})` : ''
        const errorCode = fetchError.code ? ` [${fetchError.code}]` : ''
        
        throw new Error(
          `无法连接到 Notion API: ${errorMessage}${errorCause}${errorCode}。` +
          `请检查：1) 网络连接是否正常 2) 防火墙设置 3) 代理配置 4) Notion API 服务是否可访问`
        )
      }

      if (!response.ok) {
        let errorData: any
        try {
          errorData = await response.json()
        } catch {
          errorData = { message: `HTTP ${response.status} ${response.statusText}` }
        }
        
        const errorMessage = errorData.message || errorData.error || 'Unknown error'
        const errorCode = errorData.code || ''
        
        // 提供更友好的错误信息
        if (response.status === 401) {
          throw new Error(
            `Notion API 认证失败 (401): ${errorMessage}。` +
            `请检查 NOTION_API_TOKEN 是否正确，并确保集成已添加到数据库中。`
          )
        } else if (response.status === 404) {
          throw new Error(
            `Notion 数据库未找到 (404): ${errorMessage}。` +
            `请检查数据库 ID "${databaseId}" 是否正确，并确保集成有访问权限。`
          )
        } else if (response.status === 403) {
          throw new Error(
            `Notion API 权限不足 (403): ${errorMessage}。` +
            `请确保集成已添加到数据库，并具有读取权限。`
          )
        }
        
        throw new Error(`Notion API 错误 (${response.status}): ${errorMessage}${errorCode ? ` [${errorCode}]` : ''}`)
      }

      return await response.json()
    } catch (error: any) {
      // 如果已经是我们格式化的错误，直接抛出
      if (error.message && (
          error.message.startsWith('无法连接到') || 
          error.message.startsWith('Notion API') ||
          error.message.startsWith('NOTION_TOKEN'))) {
        throw error
      }
      
      // 否则，格式化错误信息
      const errorMessage = error.message || 'Unknown error'
      const errorStatus = error.status || error.statusCode || 'Unknown'
      throw new Error(`Notion API 错误: ${errorStatus} - ${errorMessage}`)
    }
  }

  /**
   * 获取数据库信息
   * @param databaseId 数据库 ID
   */
  async getDatabase(databaseId: string) {
    try {
      return await this.client.databases.retrieve({
        database_id: databaseId,
      })
    } catch (error: any) {
      throw new Error(`Notion API error: ${error.status || 'Unknown'} - ${error.message || JSON.stringify(error)}`)
    }
  }

  /**
   * 获取页面详情
   * @param pageId 页面 ID
   */
  async getPage(pageId: string) {
    try {
      return await this.client.pages.retrieve({
        page_id: pageId,
      })
    } catch (error: any) {
      throw new Error(`Notion API error: ${error.status || 'Unknown'} - ${error.message || JSON.stringify(error)}`)
    }
  }

  /**
   * 创建页面
   * @param databaseId 数据库 ID
   * @param properties 页面属性
   */
  async createPage(databaseId: string, properties: NotionPageProperties) {
    try {
      return await this.client.pages.create({
        parent: {
          database_id: databaseId,
        },
        properties,
      })
    } catch (error: any) {
      throw new Error(`Notion API error: ${error.status || 'Unknown'} - ${error.message || JSON.stringify(error)}`)
    }
  }

  /**
   * 更新页面
   * @param pageId 页面 ID
   * @param properties 要更新的属性
   */
  async updatePage(pageId: string, properties: NotionPageProperties) {
    try {
      return await this.client.pages.update({
        page_id: pageId,
        properties,
      })
    } catch (error: any) {
      throw new Error(`Notion API error: ${error.status || 'Unknown'} - ${error.message || JSON.stringify(error)}`)
    }
  }

  /**
   * 删除页面（归档）
   * @param pageId 页面 ID
   */
  async deletePage(pageId: string) {
    try {
      return await this.client.pages.update({
        page_id: pageId,
        archived: true,
      })
    } catch (error: any) {
      throw new Error(`Notion API error: ${error.status || 'Unknown'} - ${error.message || JSON.stringify(error)}`)
    }
  }

  /**
   * 递归获取块的所有子块
   * @param blockId 块 ID
   * @param token API token
   */
  private async fetchBlockChildrenPage(url: string, token: string, retries: number = 3): Promise<any> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
          },
        })

        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: 'Unknown error' }))
          throw new Error(`Notion API error: ${response.status} - ${JSON.stringify(error)}`)
        }

        return await response.json()
      } catch (error: any) {
        const isNetworkError = error?.name === 'AbortError' ||
          error?.code === 'UND_ERR_SOCKET' ||
          error?.message?.includes('fetch failed') ||
          error?.message?.includes('other side closed')

        if (isNetworkError && attempt < retries) {
          const waitTime = attempt * 1000
          console.warn(`[Notion] Network error on attempt ${attempt}/${retries}, retrying in ${waitTime}ms:`, error?.message || error)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }

        const errorMessage = error?.message || 'Network request failed'
        const errorCause = error?.cause ? ` (cause: ${error.cause})` : ''
        const errorCode = error?.code ? ` [${error.code}]` : ''
        throw new Error(
          `无法连接到 Notion API: ${errorMessage}${errorCause}${errorCode}。` +
          `请检查：1) 网络连接是否正常 2) 防火墙设置 3) 代理配置 4) Notion API 服务是否可访问`
        )
      }
    }

    throw new Error('Notion API 请求失败：所有重试尝试均失败')
  }

  private async getBlockChildren(blockId: string, token: string): Promise<any[]> {
    const children: any[] = []
    let nextCursor: string | undefined = undefined

    if (!token) {
      throw new Error('NOTION_TOKEN or NOTION_API_TOKEN environment variable is not set. Please check your .env.local file.')
    }

    do {
      let url = `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`
      if (nextCursor) {
        url += `&start_cursor=${nextCursor}`
      }

      const data = await this.fetchBlockChildrenPage(url, token)
      const blocks = data.results || []
      
      // 递归获取每个块的所有子块
      for (const block of blocks) {
        if (block.has_children) {
          block.children = await this.getBlockChildren(block.id, token)
        }
      }
      
      children.push(...blocks)
      nextCursor = data.next_cursor
    } while (nextCursor)

    return children
  }

  /**
   * 获取页面的所有内容块（包括所有子块）
   * @param pageId 页面 ID
   */
  async getPageBlocks(pageId: string) {
    try {
      const token = process.env.NOTION_TOKEN || process.env.NOTION_API_TOKEN || ''
      return await this.getBlockChildren(pageId, token)
    } catch (error: any) {
      throw new Error(`Notion API error: ${error.status || 'Unknown'} - ${error.message || JSON.stringify(error)}`)
    }
  }

  /**
   * 提取块中的文本内容
   * @param block 内容块
   */
  extractBlockText(block: any): string {
    if (!block) return ''

    const type = block.type
    let text = ''

    // 提取 rich_text 类型的文本
    if (block[type]?.rich_text) {
      text = block[type].rich_text
        .map((item: any) => item.plain_text || '')
        .join('')
    }

    // 处理子块（递归）
    if (block.children && Array.isArray(block.children)) {
      const childrenText = block.children
        .map((child: any) => this.extractBlockText(child))
        .join('\n')
      if (childrenText) {
        text = text ? `${text}\n${childrenText}` : childrenText
      }
    }

    return text
  }

  /**
   * 将 rich_text 数组转换为 Markdown 格式的文本
   * @param richText rich_text 数组
   */
  private richTextToMarkdown(richText: any[]): string {
    if (!richText || !Array.isArray(richText)) return ''
    
    return richText.map((item: any) => {
      let text = item.plain_text || ''
      const annotations = item.annotations || {}
      
      // 应用格式
      if (annotations.bold) text = `**${text}**`
      if (annotations.italic) text = `*${text}*`
      if (annotations.strikethrough) text = `~~${text}~~`
      if (annotations.code) text = `\`${text}\``
      
      // 处理链接
      if (item.href) {
        text = `[${text}](${item.href})`
      }
      
      return text
    }).join('')
  }

  /**
   * 将 Notion block 转换为 Markdown 格式
   * @param block Notion block 对象
   * @param depth 嵌套深度（用于缩进）
   */
  blockToMarkdown(block: any, depth: number = 0): string {
    if (!block) return ''

    const type = block.type
    const blockData = block[type] || {}
    let markdown = ''
    const indent = '  '.repeat(depth)

    switch (type) {
      case 'paragraph':
        const paragraphText = this.richTextToMarkdown(blockData.rich_text || [])
        markdown = paragraphText || ''
        break

      case 'heading_1':
        markdown = `# ${this.richTextToMarkdown(blockData.rich_text || [])}`
        break

      case 'heading_2':
        markdown = `## ${this.richTextToMarkdown(blockData.rich_text || [])}`
        break

      case 'heading_3':
        markdown = `### ${this.richTextToMarkdown(blockData.rich_text || [])}`
        break

      case 'bulleted_list_item':
        markdown = `${indent}- ${this.richTextToMarkdown(blockData.rich_text || [])}`
        break

      case 'numbered_list_item':
        markdown = `${indent}1. ${this.richTextToMarkdown(blockData.rich_text || [])}`
        break

      case 'to_do':
        const checked = blockData.checked ? 'x' : ' '
        markdown = `${indent}- [${checked}] ${this.richTextToMarkdown(blockData.rich_text || [])}`
        break

      case 'toggle':
        markdown = `${indent}- ${this.richTextToMarkdown(blockData.rich_text || [])}`
        break

      case 'code':
        const language = blockData.language || ''
        const codeText = this.richTextToMarkdown(blockData.rich_text || [])
        markdown = `\`\`\`${language}\n${codeText}\n\`\`\``
        break

      case 'quote':
        const quoteText = this.richTextToMarkdown(blockData.rich_text || [])
        markdown = `> ${quoteText.split('\n').join('\n> ')}`
        break

      case 'callout':
        const calloutText = this.richTextToMarkdown(blockData.rich_text || [])
        const emoji = blockData.icon?.emoji || '💡'
        markdown = `> ${emoji} ${calloutText.split('\n').join('\n> ')}`
        break

      case 'divider':
        markdown = '---'
        break

      case 'table':
        // 表格需要特殊处理：先处理表头（如果有），然后处理所有行
        if (block.children && Array.isArray(block.children) && block.children.length > 0) {
          const tableRows: string[] = []
          let isFirstRow = true
          
          for (const rowBlock of block.children) {
            if (rowBlock.type === 'table_row') {
              const rowData = rowBlock.table_row || rowBlock[rowBlock.type] || {}
              const cells = (rowData.cells || []).map((cell: any[]) => 
                this.richTextToMarkdown(cell || [])
              )
              
              if (cells.length > 0) {
                const rowMarkdown = `| ${cells.join(' | ')} |`
                tableRows.push(rowMarkdown)
                
                // 第一行作为表头，添加分隔行
                if (isFirstRow) {
                  const separator = `| ${cells.map(() => '---').join(' | ')} |`
                  tableRows.push(separator)
                  isFirstRow = false
                }
              }
            }
          }
          
          markdown = tableRows.length > 0 ? '\n' + tableRows.join('\n') + '\n' : '\n[表格]\n'
        } else {
          markdown = '\n[表格]\n'
        }
        break

      case 'table_row':
        // table_row 作为 table 的子块处理，这里不应该单独出现
        const cells = (blockData.cells || []).map((cell: any[]) => 
          this.richTextToMarkdown(cell || [])
        )
        markdown = `| ${cells.join(' | ')} |`
        break

      case 'image':
        const imageUrl = blockData.type === 'external' 
          ? blockData.external?.url 
          : blockData.file?.url
        const caption = this.richTextToMarkdown(blockData.caption || [])
        markdown = `![${caption || 'image'}](${imageUrl || ''})`
        break

      case 'video':
        const videoUrl = blockData.type === 'external'
          ? blockData.external?.url
          : blockData.file?.url
        const videoCaption = this.richTextToMarkdown(blockData.caption || [])
        markdown = `[视频: ${videoCaption || 'video'}](${videoUrl || ''})`
        break

      case 'file':
        const fileUrl = blockData.type === 'external'
          ? blockData.external?.url
          : blockData.file?.url
        const fileName = blockData.name || 'file'
        markdown = `[${fileName}](${fileUrl || ''})`
        break

      case 'bookmark':
        const bookmarkUrl = blockData.url || ''
        const bookmarkCaption = this.richTextToMarkdown(blockData.caption || [])
        markdown = `[${bookmarkCaption || bookmarkUrl}](${bookmarkUrl})`
        break

      case 'link_preview':
        const linkUrl = blockData.url || ''
        markdown = `[链接预览](${linkUrl})`
        break

      case 'equation':
        markdown = `$${blockData.expression || ''}$`
        break

      case 'column_list':
      case 'column':
        // 列布局，处理子块
        break

      default:
        // 对于未知类型，尝试提取文本
        if (blockData.rich_text) {
          markdown = this.richTextToMarkdown(blockData.rich_text)
        } else {
          markdown = `[${type}]`
        }
    }

    // 处理子块（递归）
    // 注意：table 类型的子块已经在 case 中处理了，这里跳过
    if (type !== 'table' && block.children && Array.isArray(block.children) && block.children.length > 0) {
      const childrenMarkdown = block.children
        .map((child: any) => this.blockToMarkdown(child, depth + 1))
        .filter((md: string) => md.trim())
        .join('\n')
      
      if (childrenMarkdown) {
        markdown = markdown ? `${markdown}\n${childrenMarkdown}` : childrenMarkdown
      }
    }

    return markdown
  }

  /**
   * 将 Notion blocks 数组转换为 Markdown 格式
   * @param blocks Notion blocks 数组
   */
  blocksToMarkdown(blocks: any[]): string {
    if (!blocks || !Array.isArray(blocks)) return ''
    
    return blocks
      .map((block) => this.blockToMarkdown(block))
      .filter((md) => md.trim())
      .join('\n\n')
  }
}

/**
 * 提取 Notion 属性值
 * 根据属性类型提取对应的值
 */
export function extractNotionPropertyValue(property: any): any {
  if (!property) return null

  const type = property.type

  switch (type) {
    case 'title':
      return property.title?.map((item: any) => item.plain_text).join('') || ''
    case 'rich_text':
      return property.rich_text?.map((item: any) => item.plain_text).join('') || ''
    case 'number':
      return property.number
    case 'select':
      return property.select?.name || null
    case 'status':
      // 处理 status 类型，提取状态名称
      if (property.status) {
        // status 对象可能有 name 属性
        if (property.status.name) {
          return property.status.name
        }
        // 如果没有 name，但 status 本身可能是字符串
        if (typeof property.status === 'string') {
          return property.status
        }
      }
      return null
    case 'multi_select':
      return property.multi_select?.map((item: any) => item.name) || []
    case 'date':
      return property.date ? {
        start: property.date.start,
        end: property.date.end,
      } : null
    case 'checkbox':
      return property.checkbox || false
    case 'url':
      return property.url || null
    case 'email':
      return property.email || null
    case 'phone_number':
      return property.phone_number || null
    case 'relation':
      return property.relation?.map((item: any) => item.id) || []
    case 'files':
      return property.files?.map((file: any) => ({
        name: file.name,
        url: file.file?.url || file.external?.url,
      })) || []
    case 'created_time':
      return property.created_time
    case 'last_edited_time':
      return property.last_edited_time
    case 'created_by':
      return property.created_by
    case 'last_edited_by':
      return property.last_edited_by
    default:
      // 对于未知类型，尝试提取常见结构
      // 如果是 status 类型的对象但没有被识别，尝试提取
      if (property.status && property.status.name) {
        return property.status.name
      }
      // 如果是 select 类型的对象但没有被识别，尝试提取
      if (property.select && property.select.name) {
        return property.select.name
      }
      return property
  }
}

/**
 * 格式化 Notion 页面数据
 * 将 Notion 页面对象转换为易于使用的格式
 */
export function formatNotionPage(page: any): any {
  const properties: any = {}
  
  if (page.properties) {
    Object.keys(page.properties).forEach((key) => {
      properties[key] = extractNotionPropertyValue(page.properties[key])
    })
  }

  return {
    id: page.id,
    created_time: page.created_time,
    last_edited_time: page.last_edited_time,
    url: page.url,
    properties,
  }
}

/**
 * 获取 Notion 客户端实例
 */
export function getNotionClient(apiToken?: string): NotionClient {
  return new NotionClient(apiToken)
}
