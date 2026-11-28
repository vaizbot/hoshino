// Supabase Edge Function：TTS 语音链路（POST /tts）
// 链路：前端 -> 本函数 -> Supabase Storage 缓存（命中直接返回）
//      -> 未命中：小米 MiMo TTS（普通话/吴语传采样克隆声线，英日韩用内置 Chloe）
//      -> 写回 Storage -> 普通话整篇写回 articles.audio_url -> 返回音频流 + audio_url
//
// 与 Cloudflare Worker 版完全同契约（缓存 key、响应头一致），前端切换零改动。

import { createClient } from 'npm:@supabase/supabase-js@2'

/* ---------------- 常量（与 Worker 版一致） ---------------- */

const AUDIO_BUCKET = 'audio'
const MIMO_ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions'
const MIMO_MODEL_TTS = 'mimo-v2.5-tts'
const MIMO_MODEL_CLONE = 'mimo-v2.5-tts-voiceclone'
const MAX_SAMPLE_BYTES = 8_000_000
const SAMPLE_FETCH_TIMEOUT_MS = 15000
const MAX_TEXT_LENGTH = 4000
const SUGGEST_SEGMENT_LENGTH = 3000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type VoiceId = 'mandarin' | 'wu' | 'english' | 'japanese' | 'korean'

/** 调教提示词（与 Worker 版逐字一致：五声线已定型） */
const VOICE_STYLES: Record<VoiceId, string> = {
  mandarin:
    '用年轻师父的语气：温柔、耐心、带一点宠；语速自然，按语义停顿，咬字清晰干净，字音准确、声调标准、音准稳定，声音干净纯净、无杂音，不要朗读腔、不要播音腔、不要忽快忽慢，语速中，咬字清晰，字音准确、声调标准、音准稳定，句尾放松，整体流畅连贯',
  wu: '用无锡口音的普通话，年轻师父的语气，温柔耐心，带一点宠；语速自然，咬字清楚，字音准确，句尾放松，不要播音腔，语速中，咬字清晰，字音准确、声调标准、音准稳定，声音干净纯净、无杂音',
  english:
    '用年轻温柔的声音说流利自然的美式英语：发音清晰准确、语音地道、连读自然、音准稳定；语速自然平稳，按语义停顿，整体流畅连贯，像日常说话；语调起伏自然，句尾放松；语气温柔耐心，带一点宠；声音干净纯净、无杂音；不要机器腔',
  japanese:
    '用年轻温柔的声音说流利自然的日语：发音清晰准确，标准东京口音，音调自然，音准稳定；语速自然平稳，按语义停顿，整体流畅连贯，像日常说话；语气温柔耐心，带一点宠；句尾语气自然放松；声音干净纯净、无杂音；不要机器腔',
  korean:
    '用年轻温柔的声音说流利自然的韩语：发音清晰准确，标准首尔口音，语调自然，音准稳定；语速自然平稳，按语义停顿，整体流畅连贯，像日常说话；语气温柔耐心，带一点宠；句尾语气自然放松；声音干净纯净、无杂音；不要机器腔'
}

/** 英日韩的正式音色（Chloe）；普通话/吴语采样失败等罕见场景的兜底 */
const VOICE_FALLBACK: Record<VoiceId, string> = {
  mandarin: '冰糖',
  wu: '冰糖',
  english: 'Chloe',
  japanese: 'Chloe',
  korean: 'Chloe'
}

/** 采样缓存（函数实例内跨请求复用，按 URL 缓存） */
const sampleCache = new Map<string, string>()

/* ---------------- Supabase 客户端（service_role，服务端使用） ---------------- */

function getClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !key) throw new Error('Supabase 环境变量未配置')
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { 'User-Agent': 'VaizBotEdge/1.0' } }
  })
}

/* ---------------- 响应工具 ---------------- */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

function audioHeaders(
  publicUrl: string,
  warning: string | null,
  contentType = 'audio/mpeg',
  contentLength?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000',
    'X-Audio-Url': publicUrl,
    ...corsHeaders
  }
  if (contentLength) headers['Content-Length'] = contentLength
  if (warning) headers['X-TTS-Warning'] = warning
  return headers
}

/* ---------------- 主入口 ---------------- */

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
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const lang: 'zh' | 'en' = body.lang === 'en' ? 'en' : 'zh'
  const chunkIndex =
    typeof body.chunkIndex === 'number' && Number.isInteger(body.chunkIndex) && body.chunkIndex >= 0
      ? body.chunkIndex
      : undefined
  const rawVoice = typeof body.voice === 'string' ? body.voice : 'mandarin'
  const voice: VoiceId =
    rawVoice === 'wu' || rawVoice === 'english' || rawVoice === 'japanese' || rawVoice === 'korean'
      ? rawVoice
      : 'mandarin'

  if (!articleId || !text) {
    return new Response('articleId 与 text 不能为空', { status: 400, headers: corsHeaders })
  }
  if (!UUID_PATTERN.test(articleId)) {
    return new Response('articleId 必须是合法的 uuid', { status: 400, headers: corsHeaders })
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return new Response(`text 超过 ${MAX_TEXT_LENGTH} 字符，请用页面右下角的「朗读圈圈」分段朗读`, {
      status: 400,
      headers: corsHeaders
    })
  }

  const voiceSuffix = voice === 'mandarin' ? '' : `-${voice}`
  const key =
    chunkIndex === undefined ? `${articleId}${voiceSuffix}.mp3` : `${articleId}${voiceSuffix}-${chunkIndex}.mp3`
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${AUDIO_BUCKET}/${key}`
  const warning = text.length > SUGGEST_SEGMENT_LENGTH ? `text 超过 ${SUGGEST_SEGMENT_LENGTH} 字符，建议分段朗读` : null

  try {
    const client = getClient()

    // 1. Storage 缓存命中 -> 直接返回
    const cached = await client.storage.from(AUDIO_BUCKET).download(key)
    if (cached.data) {
      const bytes = await cached.data.arrayBuffer()
      console.log(`[tts] Storage 缓存命中：${key}`)
      return new Response(bytes, {
        headers: audioHeaders(publicUrl, warning, cached.data.type || 'audio/mpeg', String(bytes.byteLength))
      })
    }

    // 2. 未命中 -> MiMo 合成
    console.log(`[tts] Storage 未命中，开始合成：${key}（voice=${voice}，lang=${lang}，${text.length} 字符）`)
    const { audio, contentType } = await synthesizeWithMiMo(text, voice)

    // 3. 写入 Storage（公开桶 audio）
    const { error: upError } = await client.storage
      .from(AUDIO_BUCKET)
      .upload(key, new Uint8Array(audio), { contentType, upsert: true, cacheControl: '31536000' })
    if (upError) throw new Error(`写入 Storage 失败：${upError.message}`)
    console.log(`[tts] 音频已写入 Storage：${key}（${audio.byteLength} bytes）`)

    // 4. 普通话整篇合成才写回 articles.audio_url
    if (chunkIndex === undefined && voice === 'mandarin') {
      try {
        const { error: dbError } = await client.from('articles').update({ audio_url: publicUrl }).eq('id', articleId)
        if (dbError) console.warn(`[tts] 写回 audio_url 失败：${dbError.message}`)
        else console.log(`[tts] audio_url 已写回 Supabase：${articleId}`)
      } catch (err) {
        console.warn('[tts] 写回 Supabase 异常（不影响本次返回）：', err instanceof Error ? err.message : String(err))
      }
    }

    // 5. 返回音频流
    return new Response(audio, {
      headers: audioHeaders(publicUrl, warning, contentType, String(audio.byteLength))
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[tts] 处理失败：', message)
    return new Response(message, { status: 502, headers: corsHeaders })
  }
})

/* ---------------- MiMo 合成 ---------------- */

interface SynthesisResult {
  audio: ArrayBuffer
  contentType: string
}

async function synthesizeWithMiMo(text: string, voice: VoiceId): Promise<SynthesisResult> {
  const key = Deno.env.get('MIMO_API_KEY')
  if (!key) throw new Error('MIMO_API_KEY 未配置')

  // 普通话/吴语：采样克隆声线；英日韩：内置 Chloe
  const useSample = voice === 'mandarin' || voice === 'wu'
  const sample = useSample ? await getVoiceSampleDataUri(Deno.env.get('MIMO_VOICE_SAMPLE_URL') ?? '') : ''

  let res: Response | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(MIMO_ENDPOINT, {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: sample ? MIMO_MODEL_CLONE : MIMO_MODEL_TTS,
        messages: [
          { role: 'user', content: VOICE_STYLES[voice] },
          { role: 'assistant', content: text }
        ],
        audio: sample ? { voice: sample, format: 'wav' } : { voice: VOICE_FALLBACK[voice], format: 'wav' }
      })
    })
    if (res.status !== 429 || attempt === 2) break
    await new Promise((resolve) => setTimeout(resolve, 1800 * (attempt + 1)))
  }
  if (!res) throw new Error('MiMo 请求失败')
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`MiMo 请求失败（${res.status}）：${detail.slice(0, 300)}`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { audio?: { data?: string } } }> }
  const base64 = data?.choices?.[0]?.message?.audio?.data
  if (!base64) throw new Error('MiMo 没有返回音频')
  return { audio: base64ToArrayBuffer(base64), contentType: 'audio/wav' }
}

/** 下载声线采样并转 data URI（按 URL 缓存；失败返回空串走内置音色） */
async function getVoiceSampleDataUri(url: string): Promise<string> {
  const clean = url.trim()
  if (!clean) return ''
  const hit = sampleCache.get(clean)
  if (hit) return hit
  try {
    const response = await fetch(clean, { signal: AbortSignal.timeout(SAMPLE_FETCH_TIMEOUT_MS) })
    if (!response.ok) {
      console.warn(`[tts] 采样下载失败（${response.status}），本次改用内置音色`)
      return ''
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_SAMPLE_BYTES) {
      console.warn('[tts] 采样超过 8MB，本次改用内置音色')
      return ''
    }
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    const mime = response.headers.get('content-type') ?? 'audio/wav'
    const dataUri = `data:${mime};base64,${btoa(binary)}`
    sampleCache.set(clean, dataUri)
    return dataUri
  } catch (error) {
    console.warn('[tts] 采样下载异常，本次改用内置音色：', error instanceof Error ? error.message : String(error))
    return ''
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
