/** 技术栈占比（关于页展示用；与真实技术栈一致，后续可改为脚本按源码行数统计） */
export interface TechItem {
  name: string
  /** 官方品牌色（数据，非 UI 令牌） */
  color: string
  percent: number
}

export const TECH_STACK: TechItem[] = [
  { name: 'Vue 3', color: '#42b883', percent: 34 },
  { name: 'TypeScript', color: '#3178c6', percent: 22 },
  { name: 'Tailwind CSS', color: '#38bdf8', percent: 14 },
  { name: 'Supabase', color: '#3ecf8e', percent: 12 },
  { name: 'Cloudflare Workers', color: '#f6821f', percent: 10 },
  { name: 'MiMo TTS', color: '#fb7299', percent: 8 }
]
