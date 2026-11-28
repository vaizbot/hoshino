import { supabase } from '@/lib/supabase'
import { presetOutline } from '@/components/writing/outline'
import type { Chapter } from '@/components/writing/outline'

/** 创作项目状态：草稿 / 存稿 / 已发布 */
export type ProjectStatus = 'draft' | 'saved' | 'published'

/** 人设分类 */
export type SettingCategory = '人物' | '世界观' | '情节' | '其他'

export interface SettingItem {
  id: string
  category: SettingCategory
  title: string
  content: string
  deletedAt?: string
}

export interface WritingProject {
  id: string
  title: string
  draft: string
  status: ProjectStatus
  /** 大纲（分支叙事树，扁平的章节数组） */
  outline: Chapter[]
  /** 人设库（人物/世界观/情节/其他） */
  settings: SettingItem[]
  /** 发布后关联的文章 id（再次发布会更新同一篇） */
  article_id: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/** 兼容旧数据：outline 可能是字符串数组（写作工作台 v1 的格式），统一转为章节数组 */
function normalizeOutline(raw: unknown): Chapter[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is Chapter => typeof item === 'object' && item !== null && typeof (item as Chapter).id === 'string')
}

/** 人设库数组规范化 */
function normalizeSettings(raw: unknown): SettingItem[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (item): item is SettingItem =>
      typeof item === 'object' && item !== null && typeof (item as SettingItem).id === 'string'
  )
}

export const writingService = {
  /** 项目列表（按更新时间倒序，含回收站） */
  async list(): Promise<WritingProject[]> {
    const { data, error } = await supabase
      .from('writing_projects')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) {
      console.error('[writing] list 失败:', error.message)
      return []
    }
    return ((data ?? []) as WritingProject[]).map((p) => ({
      ...p,
      outline: normalizeOutline(p.outline),
      settings: normalizeSettings((p as unknown as Record<string, unknown>).settings)
    }))
  },

  /** 新建空白项目（带预置大纲：根节点 + 主枝子节点） */
  async create(): Promise<WritingProject | null> {
    const { data, error } = await supabase
      .from('writing_projects')
      .insert({ title: '未命名作品', draft: '', status: 'draft', outline: presetOutline(), settings: [] })
      .select('*')
      .single()
    if (error) {
      console.error('[writing] create 失败:', error.message)
      return null
    }
    const row = data as WritingProject
    return { ...row, outline: normalizeOutline(row.outline), settings: normalizeSettings((row as unknown as Record<string, unknown>).settings) }
  },

  /** 保存项目（标题/正文/状态/大纲/人设） */
  async save(p: WritingProject): Promise<boolean> {
    const { error } = await supabase
      .from('writing_projects')
      .update({
        title: p.title,
        draft: p.draft,
        status: p.status,
        outline: p.outline,
        settings: p.settings,
        updated_at: new Date().toISOString()
      })
      .eq('id', p.id)
    if (error) {
      console.error('[writing] save 失败:', error.message)
      return false
    }
    return true
  },

  /** 发布：正文写入 articles（首次新建，之后更新同一篇），并回链项目 */
  async publish(p: WritingProject): Promise<string | null> {
    const payload: Record<string, unknown> = {
      title: p.title.trim() || '未命名作品',
      content: p.draft,
      published: true,
      is_auto_fetched: false
    }
    if (p.article_id) payload.id = p.article_id
    const { data, error } = await supabase
      .from('articles')
      .upsert(payload, { onConflict: 'id' })
      .select('id')
      .single()
    if (error) {
      console.error('[writing] publish 失败:', error.message)
      return null
    }
    const articleId = (data as { id: string }).id
    await supabase
      .from('writing_projects')
      .update({ article_id: articleId, status: 'published', updated_at: new Date().toISOString() })
      .eq('id', p.id)
    return articleId
  },

  /** 移入回收站（软删除） */
  async trash(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('writing_projects')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
    return !error
  },

  /** 从回收站恢复 */
  async restore(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('writing_projects')
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq('id', id)
    return !error
  },

  /** 彻底删除 */
  async remove(id: string): Promise<boolean> {
    const { error } = await supabase.from('writing_projects').delete().eq('id', id)
    return !error
  }
}
