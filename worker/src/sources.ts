/**
 * RSS 源列表（写死在 Worker 代码里的常量数组）
 * 预抓任务按数组顺序依次尝试，取第一个「尚未入库且正文够长」的文章
 */
export interface RssSource {
  /** 展示在文章 source_name 字段的来源名称 */
  name: string
  /** RSS / Atom 订阅地址 */
  url: string
}

export const RSS_SOURCES: RssSource[] = [
  { name: 'Pustaka', url: 'https://pustaka.org/feed/latest.xml' },
  { name: 'NASA Image of the Day', url: 'https://www.nasa.gov/rss/dyn/image_of_the_day.rss' }
]
