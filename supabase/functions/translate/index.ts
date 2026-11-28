// Supabase Edge Function：翻译链路（POST /translate）
// 链路：前端 -> 本函数 -> Supabase 查 articles：content_zh / content_en 有值直接返回
//      -> 没值：免费翻译接口（Google gtx 主 / MyMemory 备）-> 写回 Supabase -> 返回译文
//
// 与 Cloudflare Worker 版同契约（请求/响应形状一致），前端切换零改动。

import { createClient } from 'npm:@supabase/supabase-js@2'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHINESE_RATIO_THRESHOLD = 0.3
/** Google gtx 单次请求正文上限（按字符保守取值） */
const GOOGLE_CHUNK = 4500
/** MyMemory 单次上限（q 参数 500 字节） */
const MYMEMORY_CHUNK = 450

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

function getClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !key) throw new Error('Supabase 环境变量未配置')
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { 'User-Agent': 'VaizBotEdge/1.0' } }
  })
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  })
}

/** 中文字符占比 > 30% 视为中文 */
function detectSourceLang(text: string): 'zh' | 'en' {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length
  const total = text.replace(/\s/g, '').length
  if (total === 0) return 'en'
  return chineseChars / total > CHINESE_RATIO_THRESHOLD ? 'zh' : 'en'
}

/** Google 翻译（gtx 免费接口）：按块翻译后拼接 */
async function translateWithGoogle(text: string, sl: string, tl: string): Promise<string> {
  const out: string[] = []
  for (let i = 0; i < text.length; i += GOOGLE_CHUNK) {
    const piece = text.slice(i, i + GOOGLE_CHUNK)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(piece)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Google 翻译接口失败（${res.status}）`)
    const data = (await res.json()) as Array<Array<unknown>>
    const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : []
    out.push(segments.map((s) => (Array.isArray(s) ? String(s[0] ?? '') : '')).join(''))
  }
  const result = out.join('')
  if (!result.trim()) throw new Error('翻译接口未返回译文')
  return result
}

/** MyMemory 兜底翻译：按块翻译后拼接 */
async function translateWithMyMemory(text: string, langpair: string): Promise<string> {
  const out: string[] = []
  for (let i = 0; i < text.length; i += MYMEMORY_CHUNK) {
    const piece = text.slice(i, i + MYMEMORY_CHUNK)
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(piece)}&langpair=${langpair}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`MyMemory 翻译接口失败（${res.status}）`)
    const data = (await res.json()) as { responseData?: { translatedText?: string } }
    const translated = data?.responseData?.translatedText ?? ''
    if (!translated.trim()) throw new Error('翻译接口未返回译文')
    out.push(translated)
  }
  return out.join('')
}

/** 翻译主逻辑：主接口失败自动换备用接口 */
async function translateText(text: string, sourceLang: 'zh' | 'en', targetLang: 'zh' | 'en'): Promise<string> {
  const sl = sourceLang
  const tl = targetLang
  const langpair = `${sl === 'zh' ? 'zh-CN' : 'en'}|${tl === 'zh' ? 'zh-CN' : 'en'}`
  try {
    return await translateWithGoogle(text, sl, tl)
  } catch (error) {
    console.warn('[translate] Google 接口失败，尝试 MyMemory 兜底：', error instanceof Error ? error.message : String(error))
    return await translateWithMyMemory(text, langpair)
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return new Response('仅支持 POST', { status: 405, headers: { ...corsHeaders, Allow: 'POST, OPTIONS' } })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return new Response('请求体必须是 JSON', { status: 400, headers: corsHeaders })
  }

  const articleId = typeof body.articleId === 'string' ? body.articleId.trim() : ''
  const targetLang: 'zh' | 'en' = body.targetLang === 'en' ? 'en' : 'zh'

  if (!articleId || !UUID_PATTERN.test(articleId)) {
    return new Response('articleId 必须是合法的 uuid', { status: 400, headers: corsHeaders })
  }

  const field: 'content_zh' | 'content_en' = targetLang === 'zh' ? 'content_zh' : 'content_en'

  try {
    const client = getClient()

    // 1. 查文章（service_role 绕过 RLS）
    const { data: article, error: qError } = await client
      .from('articles')
      .select('id, content, content_zh, content_en')
      .eq('id', articleId)
      .maybeSingle()
    if (qError) throw new Error(`查询文章失败：${qError.message}`)
    if (!article) return new Response('文章不存在', { status: 404, headers: corsHeaders })

    // 2. 已有译文 -> 直接返回（翻译缓存）
    const existing = (article as Record<string, unknown>)[field]
    if (typeof existing === 'string' && existing) {
      console.log(`[translate] 命中已有译文 ${field}：${articleId}`)
      return jsonResponse({ articleId, targetLang, translation: existing })
    }

    // 3. 判断原文语言
    const content = String(article.content ?? '')
    const sourceLang = detectSourceLang(content)
    console.log(`[translate] ${articleId}：source=${sourceLang} -> target=${targetLang}`)

    // 4. 原文与目标同语言 -> 直接回写原文（幂等）
    let translation: string
    if (sourceLang === targetLang) {
      translation = content
      console.log('[translate] 原文语言与目标语言相同，直接回写原文')
    } else {
      // 5. 调免费翻译接口
      translation = await translateText(content, sourceLang, targetLang)
    }

    // 6. 写回 Supabase
    const { error: upError } = await client
      .from('articles')
      .update({ [field]: translation })
      .eq('id', articleId)
    if (upError) throw new Error(`写回译文失败：${upError.message}`)
    console.log(`[translate] 译文已写回 ${field}：${articleId}`)

    // 7. 返回译文
    return jsonResponse({ articleId, targetLang, translation })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[translate] 处理失败：', message)
    return new Response(message, { status: 502, headers: corsHeaders })
  }
})
