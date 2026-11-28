/**
 * 文章相关类型
 * Article 与 Supabase public.articles 表结构一一对应
 */

export interface Article {
  id: string
  title: string
  content: string
  cover_url: string | null
  /** 语音朗读音频 URL（Cloudflare Workers TTS 生成后回填） */
  audio_url: string | null
  /** 中文翻译（Cloudflare Workers 翻译后回填） */
  content_zh: string | null
  /** 英文翻译（Cloudflare Workers 翻译后回填） */
  content_en: string | null
  views: number
  published: boolean
  source_url: string | null
  source_name: string | null
  is_auto_fetched: boolean
  created_at: string
  /** 分类（第一期设计升级新增，数据库默认 'article'） */
  category?: string | null
  /** 标签数组 */
  tags?: string[] | null
  /** 简介（卡片描述与 SEO） */
  description?: string | null
  /** 封面双色（['FB7299','00AEEC'] 形式，无 # 前缀） */
  cover_colors?: string[] | null
  /** 封面 emoji 图标 */
  cover_icon?: string | null
  /** 预计阅读分钟 */
  read_minutes?: number | null
  /** 首页轮播推荐位 */
  featured?: boolean
  /** 首页置顶位 */
  pinned?: boolean
}

/** 新增文章入参（id / views / created_at 由数据库生成，不可传） */
export interface ArticleInput {
  title: string
  content: string
  cover_url?: string | null
  audio_url?: string | null
  content_zh?: string | null
  content_en?: string | null
  published?: boolean
  source_url?: string | null
  source_name?: string | null
  is_auto_fetched?: boolean
}

/** 更新文章入参（所有字段均可选，只更新传入的字段） */
export type ArticlePatch = Partial<ArticleInput>
