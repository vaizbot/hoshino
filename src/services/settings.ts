import { supabase } from '@/lib/supabase'
import { loadSiteSettings } from '@/lib/site'
import type { MilestoneItem } from '@/lib/site'

/** 站点设置服务：全部走 site_settings 单行表（id=1），登录后可用 */
export const settingsService = {
  /** 保存站名/头像/签名；返回错误信息，成功返回 null */
  async saveBasic(name: string, avatarUrl: string, signature: string): Promise<string | null> {
    const { error } = await supabase.from('site_settings').upsert({
      id: 1,
      name: name.trim() || 'VaizBot',
      avatar_url: avatarUrl.trim() || null,
      signature: signature.trim(),
      updated_at: new Date().toISOString()
    })
    if (error) return error.message
    await loadSiteSettings()
    return null
  },

  /** 保存访客朗读开关 */
  async saveVisitorReading(enabled: boolean): Promise<string | null> {
    const { error } = await supabase.from('site_settings').upsert({
      id: 1,
      anonymous_tts: enabled,
      updated_at: new Date().toISOString()
    })
    if (error) return error.message
    await loadSiteSettings()
    return null
  },

  /** 保存里程碑列表（已过滤空条目） */
  async saveMilestones(list: MilestoneItem[]): Promise<string | null> {
    const clean = list.filter((m) => m.text.trim())
    const { error } = await supabase.from('site_settings').upsert({
      id: 1,
      milestones: clean,
      updated_at: new Date().toISOString()
    })
    if (error) return error.message
    await loadSiteSettings()
    return null
  }
}
