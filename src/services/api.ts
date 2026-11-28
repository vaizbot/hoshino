/**
 * 后端 API 基地址：
 * - 生产/线上：Supabase Edge Functions（国内可访问，语音+翻译都在这）
 * - 本地开发：可通过 .env.development.local 的 VITE_API_BASE_URL 指向本地 Worker（http://localhost:8787）
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ? (import.meta.env.VITE_API_BASE_URL as string).replace(/\/+$/, '')
  : 'https://ligrbkiamigtuxfcfxkf.supabase.co/functions/v1'
