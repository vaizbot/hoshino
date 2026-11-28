import { supabase } from '@/lib/supabase'
import type { Article, ArticleInput, ArticlePatch } from '@/types/article'

/** 数据表名 */
const TABLE = 'articles'

/**
 * 文章数据服务层
 *
 * 设计目的（详见 README 与交付说明）：
 * 1. 全站所有 Supabase 调用收敛在这一层，页面/组件不直接依赖 supabase 客户端；
 * 2. 出参统一为业务类型（Article[] / Article | null / boolean），
 *    内部负责 error 日志与兜底（列表失败返回 []、单条失败返回 null），UI 无需关心异常细节；
 * 3. 后续扩展（分页、搜索、RPC、缓存、mock 回退）只改这一层，调用方无感知。
 */
export const articlesService = {
  /**
   * 公开首页/详情页推荐：只取已发布文章，按创建时间倒序
   * 匿名可调用（依赖 RLS 策略 anon_select_published）
   */
  async getAllPublished(): Promise<Article[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('published', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[articles] getAllPublished 失败:', error.message)
      return []
    }
    return (data ?? []) as Article[]
  },

  /**
   * 管理后台列表：包含草稿
   * 必须登录后调用（RLS 策略 authenticated_all 才放行未发布数据；
   * 匿名调用只会被 RLS 静默过滤成「仅已发布」）
   */
  async getAll(): Promise<Article[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[articles] getAll 失败:', error.message)
      return []
    }
    return (data ?? []) as Article[]
  },

  /** 按 id 取单篇；不存在或被 RLS 过滤时返回 null */
  async getById(id: string): Promise<Article | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()

    if (error) {
      console.error('[articles] getById 失败:', error.message)
      return null
    }
    return (data as Article | null) ?? null
  },

  /** 新增文章，返回落库后的完整记录（含数据库生成的 id / created_at） */
  async create(input: ArticleInput): Promise<Article | null> {
    const { data, error } = await supabase.from(TABLE).insert(input).select('*').single()

    if (error) {
      console.error('[articles] create 失败:', error.message)
      return null
    }
    return (data as Article | null) ?? null
  },

  /** 局部更新文章（patch 只包含要改的字段），返回更新后的完整记录 */
  async update(id: string, patch: ArticlePatch): Promise<Article | null> {
    const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select('*').single()

    if (error) {
      console.error('[articles] update 失败:', error.message)
      return null
    }
    return (data as Article | null) ?? null
  },

  /** 删除文章，返回是否成功 */
  async remove(id: string): Promise<boolean> {
    const { error } = await supabase.from(TABLE).delete().eq('id', id)

    if (error) {
      console.error('[articles] remove 失败:', error.message)
      return false
    }
    return true
  },

  /**
   * 播放量 +1
   * 走数据库函数 public.increment_article_views（SECURITY DEFINER，见 supabase/schema.sql），
   * 匿名用户也能调用，且不依赖「先读后写」的竞态写法
   */
  async incrementViews(id: string): Promise<void> {
    const { error } = await supabase.rpc('increment_article_views', { article_id: id })

    if (error) {
      console.error('[articles] incrementViews 失败:', error.message)
    }
  }
}
