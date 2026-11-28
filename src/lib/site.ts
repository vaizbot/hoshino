import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

/** 里程碑条目（软删除标记） */
export interface MilestoneItem {
  year: string
  text: string
  deletedAt?: string
}

const DEFAULTS = {
  name: 'VaizBot',
  avatarUrl: '',
  signature: '我的个人小站 · 记录、分享与成长',
  anonymousTts: true
}

/** 全站站点信息（来自 site_settings 单行表；未加载/无表时用默认值） */
export const siteName = ref(DEFAULTS.name)
export const siteAvatar = ref(DEFAULTS.avatarUrl)
export const siteSignature = ref(DEFAULTS.signature)
/** 访客朗读开关（预留：关闭时未登录访客看不到朗读入口） */
export const visitorReading = ref(DEFAULTS.anonymousTts)
export const milestones = ref<MilestoneItem[]>([])

interface SettingsRow {
  name?: string | null
  avatar_url?: string | null
  signature?: string | null
  anonymous_tts?: boolean | null
  milestones?: unknown
}

function applyRow(row: SettingsRow | null | undefined): void {
  if (!row) return
  if (row.name?.trim()) siteName.value = row.name.trim()
  if (typeof row.avatar_url === 'string') siteAvatar.value = row.avatar_url
  if (typeof row.signature === 'string') siteSignature.value = row.signature
  if (typeof row.anonymous_tts === 'boolean') visitorReading.value = row.anonymous_tts
  if (Array.isArray(row.milestones)) {
    milestones.value = (row.milestones as MilestoneItem[])
      .map((m) => ({
        year: String(m.year ?? ''),
        text: String(m.text ?? ''),
        ...(m.deletedAt ? { deletedAt: String(m.deletedAt) } : {})
      }))
      .filter((m) => m.text)
  }
}

/** 拉取站点设置（表不存在/未授权时静默回退默认值，不阻塞页面） */
export async function loadSiteSettings(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('name,avatar_url,signature,anonymous_tts,milestones')
      .eq('id', 1)
      .maybeSingle()
    if (error) return
    applyRow(data as SettingsRow | null)
  } catch {
    /* 回退默认值 */
  }
}

/** 展示用的活跃里程碑（不含回收站） */
export function activeMilestones(): MilestoneItem[] {
  return milestones.value.filter((m) => !m.deletedAt)
}
