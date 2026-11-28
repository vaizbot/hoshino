import { createClient } from '@supabase/supabase-js'

/**
 * Supabase 客户端（全站单例）
 *
 * 环境变量在 .env.local 中配置（模板见 .env.example）：
 *   VITE_SUPABASE_URL      Supabase 控制台 → Project Settings → API → Project URL
 *   VITE_SUPABASE_ANON_KEY Supabase 控制台 → Project Settings → API → anon public key
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] 缺少环境变量 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。' +
      '请复制 .env.example 为 .env.local，并填入 Supabase 控制台 → Project Settings → API 中的值后重启 dev server。'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
