/**
 * TTS 语音服务：请求后端 /tts 接口（默认 Supabase Edge Functions，本地开发可指向 Worker）
 * 链路：前端 -> 后端 -> Supabase Storage 缓存（命中直接返回）
 *      -> 未命中：小米 MiMo 合成（传采样克隆声线；英日韩用内置 Chloe）
 *      -> 写回 Supabase articles.audio_url -> 返回音频
 */

import { API_BASE } from './api'

/** 声线：普通话 / 吴侬软语 / 英语 / 日语 / 韩语（同一采样，只换调教提示词） */
export type TtsVoice = 'mandarin' | 'wu' | 'english' | 'japanese' | 'korean'

export interface TtsResult {
  /** Storage 公共音频地址（整篇普通话合成时 Worker 已写回 Supabase articles.audio_url） */
  audioUrl: string
  /** 本次返回音频的对象 URL，可直接赋给 <audio>.src 播放；用完记得 URL.revokeObjectURL */
  objectUrl: string
}

/**
 * 生成 / 获取文章语音
 * @param articleId 文章 id（uuid），也是 Storage 缓存 key
 * @param text 要朗读的正文（单次不超过 4000 字符；长文请用朗读圈圈分段）
 * @param lang 文本语言：zh / en，缺省 zh
 * @param chunkIndex 分段朗读的段序号：传入时缓存 key 为 articleId-{n}，且不会写回 audio_url
 * @param voice 声线，缺省 mandarin
 * @returns 音频对象 URL 与持久化的 audio_url；失败抛出带错误信息的异常
 */
export async function requestTTS(
  articleId: string,
  text: string,
  lang: 'zh' | 'en' = 'zh',
  chunkIndex?: number,
  voice: TtsVoice = 'mandarin'
): Promise<TtsResult> {
  const response = await fetch(`${API_BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      articleId,
      text,
      lang,
      voice,
      ...(chunkIndex !== undefined ? { chunkIndex } : {})
    })
  })

  if (!response.ok) {
    const message = (await response.text()).slice(0, 300) || `HTTP ${response.status}`
    throw new Error(`TTS 生成失败：${message}`)
  }

  // Worker 对超过 3000 字符的文本会返回分段建议（不阻断）
  const warning = response.headers.get('X-TTS-Warning')
  if (warning) console.warn(`[tts] ${warning}`)

  const audioUrl = response.headers.get('X-Audio-Url') ?? ''
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)

  return { audioUrl, objectUrl }
}
