import { reactive } from 'vue'

import { FALLBACK_TRACKS, loadPlaylist } from './meting'
import type { TrackItem } from './meting'

/**
 * 音乐播放器状态机：全站唯一播放逻辑，组件只做渲染
 * - 网易云歌单（Meting 双接口 + 24h 缓存 + 内置兜底音源）
 * - LRC 歌词按音频真实时间同步
 * - 单曲失败自动下一首；连续 3 首失败整体切换备用音源
 * - 与其他音频源（朗读）互斥：开播广播事件，对方自动暂停
 */

export type LoopMode = 'list' | 'one' | 'random'

export interface LyricLine {
  time: number
  text: string
}

/** 网易云歌单 ID 与 Meting 接口（沿用旧站配置） */
const PLAYLIST_ID = '18453574160'
const METING_APIS = ['https://api.injahow.cn/meting/', 'https://api.i-meto.com/meting/api']

/** 全站音频互斥事件：detail 为音源标识（'music' / 'tts'） */
export const AUDIO_EVENT = 'vaizbot-audio'

export function notifyAudioStart(source: string): void {
  window.dispatchEvent(new CustomEvent(AUDIO_EVENT, { detail: source }))
}

export const music = reactive({
  ready: false,
  tracks: [] as TrackItem[],
  index: -1,
  playing: false,
  buffering: false,
  loop: 'list' as LoopMode,
  volume: 0.8,
  time: 0,
  duration: 0,
  lyricIndex: -1,
  /** 歌词加载完成计数：驱动 UI 立即刷新 */
  lyricVersion: 0,
  usingFallback: false
})

let audio: HTMLAudioElement | null = null
let failCount = 0
let lyricLines: LyricLine[] = []

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.volume = music.volume
  audio.addEventListener('timeupdate', () => {
    music.time = audio?.currentTime ?? 0
    updateLyricIndex()
  })
  audio.addEventListener('loadedmetadata', () => {
    music.duration = audio?.duration ?? 0
  })
  audio.addEventListener('ended', () => {
    if (music.loop === 'one') {
      void audio?.play().catch(() => undefined)
    } else {
      next()
    }
  })
  audio.addEventListener('error', () => {
    if (!audio?.src) return
    onTrackError()
  })
  audio.addEventListener('waiting', () => {
    music.buffering = true
  })
  // 播放状态由音频事件驱动：UI 永远与真实状态同步（歌单点播/切歌/失败重试全联动）
  audio.addEventListener('play', () => {
    music.playing = true
    music.buffering = false
  })
  audio.addEventListener('pause', () => {
    music.playing = false
  })
  audio.addEventListener('canplay', () => {
    music.buffering = false
  })
  return audio
}

/** App 挂载时调用：初始化 + 拉取歌单 */
export function initMusic(): void {
  ensureAudio()
  void refreshPlaylist()
}

export async function refreshPlaylist(): Promise<void> {
  music.tracks = await loadPlaylist(PLAYLIST_ID, METING_APIS)
  music.usingFallback = music.tracks === FALLBACK_TRACKS
  failCount = 0
  music.ready = true
  if (music.index < 0) music.index = 0
}

function applySrc(): void {
  const a = ensureAudio()
  const t = music.tracks[music.index]
  if (!t) return
  a.src = t.url
  lyricLines = []
  music.time = 0
  music.duration = 0
  music.lyricIndex = -1
  music.lyricVersion++
  notifyAudioStart('music')
  void resolveLyrics(t)
  void a.play().catch(() => onTrackError())
}

/* ---- 歌词：内联 LRC 或 LRC 文件 URL ---- */
const lyricCache = new Map<string, LyricLine[]>()

async function resolveLyrics(track: TrackItem): Promise<void> {
  const raw = track.lrc.trim()
  if (!raw) return
  if (!/^https?:\/\//i.test(raw)) {
    setLyrics(parseLrc(raw))
    return
  }
  const cached = lyricCache.get(raw)
  if (cached) {
    setLyrics(cached)
    return
  }
  try {
    const res = await fetch(raw, { cache: 'force-cache' })
    if (!res.ok) return
    const text = await res.text()
    const lines = parseLrc(text)
    if (lines.length) {
      lyricCache.set(raw, lines)
      setLyrics(lines)
    }
  } catch {
    /* 歌词失败不影响播放 */
  }
}

function setLyrics(lines: LyricLine[]): void {
  lyricLines = lines
  music.lyricVersion++
  updateLyricIndex()
}

/* ---- 控制 ---- */
export function toggle(): void {
  const a = ensureAudio()
  if (!a.src && music.tracks.length) {
    applySrc()
    return
  }
  if (music.playing) a.pause()
  else {
    notifyAudioStart('music')
    void a.play().catch(() => undefined)
  }
  // 状态由 play/pause 事件更新，这里不再手动翻转
}

export function playAt(i: number): void {
  if (i < 0 || i >= music.tracks.length) return
  music.index = i
  notifyAudioStart('music')
  applySrc()
}

export function next(): void {
  if (!music.tracks.length) return
  if (music.loop === 'random') {
    music.index = Math.floor(Math.random() * music.tracks.length)
  } else {
    music.index = (music.index + 1) % music.tracks.length
  }
  notifyAudioStart('music')
  applySrc()
}

export function prev(): void {
  if (!music.tracks.length) return
  music.index = (music.index - 1 + music.tracks.length) % music.tracks.length
  notifyAudioStart('music')
  applySrc()
}

export function seek(t: number): void {
  const a = ensureAudio()
  a.currentTime = t
  music.time = t
}

export function setVolume(v: number): void {
  music.volume = v
  ensureAudio().volume = v
}

export function setLoop(m: LoopMode): void {
  music.loop = m
}

export function currentTrack(): TrackItem | null {
  return music.tracks[music.index] ?? null
}

export function lyrics(): LyricLine[] {
  return lyricLines
}

/** 单曲失败自动下一首；连续 3 首失败整体切换备用音源 */
function onTrackError(): void {
  if (music.usingFallback) {
    failCount = (failCount + 1) % Math.max(1, music.tracks.length)
    next()
    return
  }
  failCount++
  if (failCount >= 3) {
    music.tracks = FALLBACK_TRACKS
    music.usingFallback = true
    music.index = 0
    failCount = 0
    applySrc()
    return
  }
  next()
}

function updateLyricIndex(): void {
  const t = audio ? audio.currentTime : music.time
  let idx = -1
  for (let i = 0; i < lyricLines.length; i++) {
    if (lyricLines[i].time <= t) idx = i
    else break
  }
  if (idx !== music.lyricIndex) music.lyricIndex = idx
}

/** 解析 LRC：支持一行多时间戳 [mm:ss.xx] */
function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
  for (const line of lrc.split('\n')) {
    const stamps: number[] = []
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(line)) !== null) {
      stamps.push(Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0))
    }
    const text = line.replace(/\[[^\]]*\]/g, '').trim()
    if (!text) continue
    for (const s of stamps) lines.push({ time: s, text })
  }
  lines.sort((a, b) => a.time - b.time)
  return lines
}

/* ---- 其他音源开播 -> 暂停音乐 ---- */
window.addEventListener(AUDIO_EVENT, ((e: CustomEvent<{ source: string }>) => {
  if (e.detail?.source !== 'music' && music.playing) {
    ensureAudio().pause()
    music.playing = false
  }
}) as EventListener)
