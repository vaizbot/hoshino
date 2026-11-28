/**
 * 翻译服务：请求后端 /translate 接口（默认 Supabase Edge Functions，本地开发可指向 Worker）
 * 链路：前端 -> 后端 -> Supabase 查目标语言字段（content_zh / content_en，有值直接返回）
 *      -> 没值：免费翻译接口 -> 写回 Supabase -> 返回译文
 */

import { API_BASE } from './api'

export interface TranslateResult {
  /** 文章 id */
  articleId: string
  /** 目标语言：zh / en */
  targetLang: 'zh' | 'en'
  /** 译文 */
  translation: string
}

/**
 * 翻译文章正文
 * @param articleId 文章 id（uuid）
 * @param targetLang 目标语言：zh -> content_zh；en -> content_en（缺省 zh）
 * @returns 译文；失败抛出带 Workers 错误信息的异常
 */
export async function requestTranslate(
  articleId: string,
  targetLang: 'zh' | 'en' = 'zh'
): Promise<TranslateResult> {
  const response = await fetch(`${API_BASE}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId, targetLang })
  })

  if (!response.ok) {
    const message = (await response.text()).slice(0, 300) || `HTTP ${response.status}`
    throw new Error(`翻译失败：${message}`)
  }

  return (await response.json()) as TranslateResult
}
