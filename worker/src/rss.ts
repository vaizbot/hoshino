/**
 * 轻量 RSS / Atom 解析（纯正则实现，零运行时依赖）
 * 只提取定时抓取需要的字段：title / link / pubDate / content
 */

export interface RssItem {
  /** 标题（纯文本） */
  title: string
  /** 原文链接 */
  link: string
  /** 发布时间 ISO 8601 字符串；解析失败为 null */
  pubDate: string | null
  /** 正文纯文本（已去除 CDATA / HTML 标签 / XML 实体） */
  content: string
}

/** 解析 RSS 2.0 或 Atom 订阅源，返回条目列表 */
export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = []

  // RSS 2.0：<item>…</item>
  const rssBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
  for (const block of rssBlocks) {
    items.push(parseRssItem(block))
  }

  // Atom：<entry>…</entry>（RSS 没有匹配到条目时走这里）
  if (items.length === 0) {
    const atomBlocks = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []
    for (const block of atomBlocks) {
      items.push(parseAtomEntry(block))
    }
  }

  return items
}

function parseRssItem(block: string): RssItem {
  const title = cleanText(extractTag(block, 'title'))
  const link = cleanText(extractTag(block, 'link'))
  const content = cleanText(extractTag(block, 'content:encoded') || extractTag(block, 'description'))
  const pubDate = parseDate(extractTag(block, 'pubDate'))
  return { title, link, pubDate, content }
}

function parseAtomEntry(block: string): RssItem {
  const title = cleanText(extractTag(block, 'title'))
  const link = cleanText(extractAttribute(block, 'link', 'href'))
  const content = cleanText(extractTag(block, 'content') || extractTag(block, 'summary'))
  const pubDate = parseDate(extractTag(block, 'published') || extractTag(block, 'updated'))
  return { title, link, pubDate, content }
}

/** 提取 <tag>…</tag> 的内容（tag 可带命名空间前缀，如 content:encoded） */
function extractTag(block: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = block.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'))
  return match ? match[1] : ''
}

/** 提取 <tag attr="value"> 形式的属性值（用于 Atom 的 <link href="…">） */
function extractAttribute(block: string, tag: string, attribute: string): string {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*?${attribute}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return match ? match[1] : ''
}

/** 常见 XML 实体解码（先解码再剥标签，避免 &lt;b&gt; 残留） */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/** 去掉 CDATA 包裹符与 HTML 标签，压缩空白 */
function stripTags(text: string): string {
  return text
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 内容清洗流水线：实体解码 -> 剥标签 */
function cleanText(raw: string): string {
  return stripTags(decodeEntities(raw))
}

/** RFC822 / RFC3339 时间转 ISO 8601，失败返回 null */
function parseDate(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
