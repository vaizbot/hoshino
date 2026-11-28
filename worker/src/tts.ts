import {
  AUDIO_BUCKET,
  downloadStorageObject,
  storageObjectHead,
  updateArticleAudioUrl,
  uploadStorageObject
} from './supabase'
import type { DbEnv } from './supabase'
import { corsHeaders, preflightResponse } from './cors'
import type { CorsEnv } from './cors'

/**
 * TTS 语音链路（POST /tts）
 * 前端 -> Workers -> Supabase Storage 缓存（命中直接返回）
 *      -> 未命中：小米 MiMo TTS（传声线采样当场克隆，style 提示词复刻旧站调教）
 *      -> 写 Supabase Storage -> 写回 articles.audio_url -> 返回音频流 + audio_url
 */

export interface TtsEnv extends DbEnv, CorsEnv {
  /** Workers AI 绑定（英文免费兜底用，wrangler.toml 的 [ai]） */
  AI: Ai
  /** 小米 MiMo API Key（wrangler secret put 注入） */
  MIMO_API_KEY: string
  /** 声线采样公开 URL（四段视频提取）：五种声线共用同一采样，只换提示词 */
  MIMO_VOICE_SAMPLE_URL: string
}

export interface TtsRequestBody {
  /** 文章 id（uuid），同时用作缓存 key */
  articleId: string
  /** 要朗读的正文 */
  text: string
  /** 文本语言：zh / en，缺省 zh */
  lang?: 'zh' | 'en'
  /** 分段朗读的段序号：传入时缓存 key 带段号，且不写回 audio_url */
  chunkIndex?: number
  /** 声线：mandarin 普通话 / wu 吴侬软语 / english 英语 / japanese 日语 / korean 韩语，缺省 mandarin */
  voice?: VoiceId
}

type VoiceId = 'mandarin' | 'wu' | 'english' | 'japanese' | 'korean'

/**
 * 调教提示词（音控级）
 * - mandarin / wu：逐字复刻旧站 voicePresets.ts 与 buildStyle 的拼接（旧站已验证的配方）
 * - english / japanese / korean：按旧站同款结构撰写：音色语气 -> 语速停顿 -> 发音音准 -> 负面约束
 */
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

/** 采样下载失败等罕见场景下使用的 MiMo 内置音色；英日韩的正式音色（等你试听选定后更新） */
const VOICE_FALLBACK: Record<VoiceId, string> = {
  mandarin: '冰糖',
  wu: '冰糖',
  english: 'Chloe',
  japanese: 'Chloe',
  korean: 'Chloe'
}

/** MiMo 接口与模型 */
const MIMO_ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions'
const MIMO_MODEL_TTS = 'mimo-v2.5-tts'
const MIMO_MODEL_CLONE = 'mimo-v2.5-tts-voiceclone'
/** 克隆采样大小上限（与旧站一致） */
const MAX_SAMPLE_BYTES = 8_000_000
/** 采样下载超时 */
const SAMPLE_FETCH_TIMEOUT_MS = 15000

/** 免费兜底模型：Workers AI 英文 TTS（中文 TTS 模型已于 2026-11 全部下架，仅英文可用） */
const FALLBACK_TTS_MODEL = '@cf/deepgram/aura-2-en'
/** 单次合成正文上限（MiMo 限制；超长请用前端「朗读圈圈」分段） */
const MAX_TEXT_LENGTH = 4000
/** 超过此长度建议分段（只提示，不阻断） */
const SUGGEST_SEGMENT_LENGTH = 3000
/** 文章 id 必须是 uuid，用作缓存 key 前先校验，防止路径注入 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 采样缓存（Worker isolate 内跨请求复用，按 URL 缓存，避免每次朗读都重新下载采样）
const sampleCache = new Map<string, string>()

/** /tts 入口（由 index.ts 的 fetch 路由调用） */
export async function handleTtsRequest(request: Request, env: TtsEnv): Promise<Response> {
  // CORS 预检：OPTIONS 直接 204 返回
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
  let body: TtsRequestBody
  try {
    body = (await request.json()) as TtsRequestBody
  } catch {
    return new Response('请求体必须是 JSON', { status: 400, headers: cors })
  }

  const articleId = typeof body.articleId === 'string' ? body.articleId.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const lang: 'zh' | 'en' = body.lang === 'en' ? 'en' : 'zh'
  const chunkIndex =
    typeof body.chunkIndex === 'number' && Number.isInteger(body.chunkIndex) && body.chunkIndex >= 0
      ? body.chunkIndex
      : undefined
  const voice: VoiceId =
    body.voice === 'wu' ||
    body.voice === 'english' ||
    body.voice === 'japanese' ||
    body.voice === 'korean' ||
    body.voice === 'mandarin'
      ? body.voice
      : 'mandarin'

  if (!articleId || !text) {
    return new Response('articleId 与 text 不能为空', { status: 400, headers: cors })
  }
  if (!UUID_PATTERN.test(articleId)) {
    return new Response('articleId 必须是合法的 uuid', { status: 400, headers: cors })
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return new Response(
      `text 超过 ${MAX_TEXT_LENGTH} 字符，请用页面右下角的「朗读圈圈」分段朗读`,
      { status: 400, headers: cors }
    )
  }

  // 缓存 key 带上声线，避免三种声线互相覆盖；普通话整篇仍用 articleId.mp3
  const voiceSuffix = voice === 'mandarin' ? '' : `-${voice}`
  const key =
    chunkIndex === undefined
      ? `${articleId}${voiceSuffix}.mp3`
      : `${articleId}${voiceSuffix}-${chunkIndex}.mp3`
  const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${key}`
  const warning =
    text.length > SUGGEST_SEGMENT_LENGTH ? `text 超过 ${SUGGEST_SEGMENT_LENGTH} 字符，建议分段朗读` : null

  try {
    // 1. Supabase Storage 缓存命中 -> 直接返回音频
    const cachedType = await storageObjectHead(env, key)
    if (cachedType) {
      const cached = await downloadStorageObject(env, key)
      if (cached) {
        console.log(`[tts] Storage 缓存命中：${key}`)
        return new Response(cached, {
          headers: audioHeaders(publicUrl, warning, cors, cachedType, String(cached.byteLength))
        })
      }
    }

    // 2. 未命中 -> 合成（优先 MiMo 指定声线，失败自动回退 Cloudflare 免费英文 TTS）
    console.log(
      `[tts] Storage 未命中，开始合成：${key}（voice=${voice}，lang=${lang}，${text.length} 字符${chunkIndex !== undefined ? `，第 ${chunkIndex} 段` : ''}）`
    )
    const { audio, contentType } = await synthesizeWithFallback(env, text, lang, voice)

    // 3. 写入 Supabase Storage（公开桶 audio）
    await uploadStorageObject(env, key, audio, contentType)
    console.log(`[tts] 音频已写入 Storage：${key}（${audio.byteLength} bytes，${contentType}）`)

    // 4. 普通话整篇合成才写回 articles.audio_url（作为文章的官方音频；分段与其他声线不写）
    if (chunkIndex === undefined && voice === 'mandarin') {
      try {
        await updateArticleAudioUrl(env, articleId, publicUrl)
        console.log(`[tts] audio_url 已写回 Supabase：${articleId}`)
      } catch (error) {
        console.warn(
          '[tts] 写回 Supabase 失败（不影响本次返回）：',
          error instanceof Error ? error.message : String(error)
        )
      }
    }

    // 5. 返回音频流 + audio_url（响应头 X-Audio-Url）
    return new Response(audio, {
      headers: audioHeaders(publicUrl, warning, cors, contentType, String(audio.byteLength))
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[tts] 处理失败：', message)
    return new Response(message, { status: 502, headers: cors })
  }
}

interface SynthesisResult {
  audio: ArrayBuffer
  contentType: string
}

/** 优先 MiMo（指定声线）；未配置或失败时回退 Cloudflare 免费英文 TTS */
async function synthesizeWithFallback(
  env: TtsEnv,
  text: string,
  lang: 'zh' | 'en',
  voice: VoiceId
): Promise<SynthesisResult> {
  if (env.MIMO_API_KEY) {
    try {
      return await synthesizeWithMiMo(env, text, voice)
    } catch (error) {
      console.warn(
        `[tts] MiMo 合成失败（${error instanceof Error ? error.message : String(error)}），尝试免费兜底`
      )
    }
  } else {
    console.warn('[tts] 未配置 MIMO_API_KEY（中文朗读不可用，英文可走免费兜底）')
  }
  try {
    return await synthesizeWithWorkersAi(env, text, lang)
  } catch (fallbackError) {
    throw new Error(
      `MiMo 与免费 TTS 均失败：${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
    )
  }
}

/**
 * 小米 MiMo TTS（与旧站 hoshino/vaizbot-v2 的 mimo-tts 同款机制）
 * - 有采样：mimo-v2.5-tts-voiceclone，请求时传 base64 采样，当场克隆声线
 * - 无采样（英语）：mimo-v2.5-tts，内置音色
 * - style 提示词决定语气（逐字复刻旧站调教）
 */
async function synthesizeWithMiMo(env: TtsEnv, text: string, voice: VoiceId): Promise<SynthesisResult> {
  // 中文/吴语：用你的采样克隆声线；英日韩：跨语种克隆效果差，改用 MiMo 内置音色（保底线）
  const useSample = voice === 'mandarin' || voice === 'wu'
  const sample = useSample ? await getVoiceSampleDataUri(env.MIMO_VOICE_SAMPLE_URL) : ''

  let res: Response | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(MIMO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': env.MIMO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: sample ? MIMO_MODEL_CLONE : MIMO_MODEL_TTS,
        messages: [
          { role: 'user', content: VOICE_STYLES[voice] },
          { role: 'assistant', content: text }
        ],
        audio: sample
          ? { voice: sample, format: 'wav' }
          : { voice: VOICE_FALLBACK[voice], format: 'wav' }
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
  const data = (await res.json()) as {
    choices?: Array<{ message?: { audio?: { data?: string } } }>
  }
  const base64 = data?.choices?.[0]?.message?.audio?.data
  if (!base64) throw new Error('MiMo 没有返回音频')
  return { audio: base64ToArrayBuffer(base64), contentType: 'audio/wav' }
}

/** 下载声线采样并转成 data URI（按 URL 缓存；失败返回空串，走内置音色） */
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
    // 分块转二进制字符串，避免大数组展开导致栈溢出（旧站同款做法）
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    const mime = response.headers.get('content-type') ?? 'audio/wav'
    const dataUri = `data:${mime};base64,${btoa(binary)}`
    sampleCache.set(clean, dataUri)
    return dataUri
  } catch (error) {
    console.warn(
      '[tts] 采样下载异常，本次改用内置音色：',
      error instanceof Error ? error.message : String(error)
    )
    return ''
  }
}

/** Cloudflare Workers AI 免费英文 TTS（@cf/deepgram/aura-2-en；中文需配置 MIMO_API_KEY） */
async function synthesizeWithWorkersAi(
  env: TtsEnv,
  text: string,
  lang: 'zh' | 'en'
): Promise<SynthesisResult> {
  if (lang !== 'en') {
    throw new Error('MiMo 暂时不可用（可能是免费额度限流），且 Workers AI 已无免费中文 TTS 模型，请稍后重试')
  }
  const base64 = await env.AI.run(FALLBACK_TTS_MODEL, { text })
  if (!base64) {
    throw new Error('Workers AI 未返回音频')
  }
  return { audio: base64ToArrayBuffer(base64), contentType: 'audio/mpeg' }
}

/** base64 -> ArrayBuffer（Workers 运行时自带 atob） */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/** 音频响应头 */
function audioHeaders(
  publicUrl: string,
  warning: string | null,
  cors: Record<string, string>,
  contentType = 'audio/mpeg',
  contentLength?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000',
    'X-Audio-Url': publicUrl,
    ...cors
  }
  if (contentLength) headers['Content-Length'] = contentLength
  if (warning) headers['X-TTS-Warning'] = warning
  return headers
}
