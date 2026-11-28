import { getArticleById, updateArticleTranslation } from './supabase'
import type { DbEnv } from './supabase'
import { corsHeaders, preflightResponse } from './cors'
import type { CorsEnv } from './cors'

/**
 * 翻译链路（POST /translate）
 * 前端 -> Workers -> Supabase 查 articles：目标语言字段（content_zh / content_en）有值直接返回
 *      -> 没值：Workers AI（@cf/meta/m2m100-1.2b）翻译 -> 写回 Supabase 对应字段 -> 返回译文
 */

export interface TranslateEnv extends DbEnv, CorsEnv {
  /** Workers AI 绑定（wrangler.toml 的 [ai]） */
  AI: Ai
}

export interface TranslateRequestBody {
  /** 文章 id（uuid） */
  articleId: string
  /** 目标语言：zh -> content_zh；en -> content_en（缺省 zh） */
  targetLang?: 'zh' | 'en'
}

/** 翻译模型 ID。如后续想换质量更好的大模型（如 @cf/qwen/qwen3.8-27b），只改这里 + 下方 run() 的入参/出参形状 */
const TRANSLATION_MODEL = '@cf/meta/m2m100-1.2b'
/** 中文字符占比超过该阈值即视为中文文章 */
const CHINESE_RATIO_THRESHOLD = 0.3
/** 文章 id 必须是 uuid（与 /tts 相同的前置校验） */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** /translate 入口（由 index.ts 的 fetch 路由调用） */
export async function handleTranslateRequest(
  request: Request,
  env: TranslateEnv
): Promise<Response> {
  // CORS 预检
  if (request.method === 'OPTIONS') {
    return preflightResponse(request, env)
  }

  const cors = corsHeaders(request, env)
  if (!cors) {
    return new Response('CORS：当前来源不被允许', { status: 403 })
  }

  if (request.method !== 'POST') {
    return new Response('仅支持 POST', { status: 405, headers: { ...cors, Allow: 'POST, OPTIONS' } })
  }

  // 解析请求体
  let body: TranslateRequestBody
  try {
    body = (await request.json()) as TranslateRequestBody
  } catch {
    return new Response('请求体必须是 JSON', { status: 400, headers: cors })
  }

  const articleId = typeof body.articleId === 'string' ? body.articleId.trim() : ''
  const targetLang: 'zh' | 'en' = body.targetLang === 'en' ? 'en' : 'zh'

  if (!articleId) {
    return new Response('articleId 不能为空', { status: 400, headers: cors })
  }
  if (!UUID_PATTERN.test(articleId)) {
    return new Response('articleId 必须是合法的 uuid', { status: 400, headers: cors })
  }

  const field: 'content_zh' | 'content_en' = targetLang === 'zh' ? 'content_zh' : 'content_en'

  try {
    // 1. 查文章（service_role，绕过 RLS）
    const article = await getArticleById(env, articleId)
    if (!article) {
      return new Response('文章不存在', { status: 404, headers: cors })
    }

    // 2. 目标语言字段已有值 -> 直接返回（等价于「翻译缓存」）
    const existing = article[field]
    if (existing) {
      console.log(`[translate] 命中已有译文 ${field}：${articleId}`)
      return jsonResponse({ articleId, targetLang, translation: existing }, cors)
    }

    // 3. 判断原文语言：正则统计中文字符占比，超过 30% 视为中文，否则视为英文
    const sourceLang = detectSourceLang(article.content)
    console.log(`[translate] ${articleId}：source=${sourceLang} -> target=${targetLang}`)

    // 4. 原文语言与目标语言一致：无需翻译，直接把原文写入目标字段（幂等，避免每次白调模型）
    let translation: string
    if (sourceLang === targetLang) {
      translation = article.content
      console.log('[translate] 原文语言与目标语言相同，直接回写原文')
    } else {
      // 5. 调 Workers AI 翻译（模型：@cf/meta/m2m100-1.2b）
      //    换模型示例（qwen3.8-27b，指令式大模型，出入参不同）：
      //    const result = await env.AI.run('@cf/qwen/qwen3.8-27b', {
      //      messages: [{ role: 'user', content: `把下面的${sourceLang === 'zh' ? '中文' : '英文'}翻译成${targetLang === 'zh' ? '中文' : '英文'}，只输出译文：\n\n${article.content}` }],
      //      max_tokens: 8192
      //    })
      //    translation = (result as { response?: string }).response ?? ''
      const result = await env.AI.run(TRANSLATION_MODEL, {
        text: article.content,
        source_lang: sourceLang,
        target_lang: targetLang
      })
      // run() 的返回类型是「同步结果 { translated_text } | 异步队列 { request_id }」的联合；
      // 我们走同步调用（没传 requests 批量入参），按同步结果取 translated_text
      translation = (result as { translated_text?: string }).translated_text ?? ''
      if (!translation.trim()) {
        throw new Error('Workers AI 未返回译文')
      }
    }

    // 6. 写回 Supabase 对应字段（content_zh / content_en）
    await updateArticleTranslation(env, articleId, field, translation)
    console.log(`[translate] 译文已写回 ${field}：${articleId}`)

    // 7. 返回译文
    return jsonResponse({ articleId, targetLang, translation }, cors)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[translate] 处理失败：', message)
    return new Response(message, { status: 502, headers: cors })
  }
}

/** 用正则 /[\u4e00-\u9fa5]/ 统计中文字符占比，超过 30% 视为中文 */
function detectSourceLang(text: string): 'zh' | 'en' {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length
  const total = text.replace(/\s/g, '').length // 去掉空白再统计，避免空白拉低占比
  if (total === 0) return 'en'
  return chineseChars / total > CHINESE_RATIO_THRESHOLD ? 'zh' : 'en'
}

function jsonResponse(payload: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
  })
}
