/**
 * Meting 歌单封装（网易云歌单）
 * - 双接口依次回退
 * - 24 小时本地缓存
 * - 全部失败时回退内置音源（保证播放器永远有声）
 */

export interface TrackItem {
  name: string
  artist: string
  url: string
  cover: string
  lrc: string
}

interface CachePayload {
  playlistId: string
  ts: number
  tracks: TrackItem[]
}

const CACHE_KEY = 'vaizbot-music-cache'
const TTL = 24 * 60 * 60 * 1000

/** 内置兜底音源（免费测试音乐） */
export const FALLBACK_TRACKS: TrackItem[] = [
  { name: 'SoundHelix Song 1', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', cover: '', lrc: '' },
  { name: 'SoundHelix Song 2', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', cover: '', lrc: '' },
  { name: 'SoundHelix Song 3', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', cover: '', lrc: '' }
]

function readCache(): CachePayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as CachePayload
    return data && Array.isArray(data.tracks) ? data : null
  } catch {
    return null
  }
}

function writeCache(playlistId: string, tracks: TrackItem[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ playlistId, ts: Date.now(), tracks } satisfies CachePayload))
  } catch {
    /* 忽略存储失败 */
  }
}

interface RawTrack {
  url?: unknown
  name?: unknown
  title?: unknown
  artist?: unknown
  author?: unknown
  pic?: unknown
  picture?: unknown
  cover?: unknown
  lrc?: unknown
  lyric?: unknown
}

function normalize(item: RawTrack | null | undefined): TrackItem | null {
  const url = item?.url
  if (typeof url !== 'string' || !url) return null
  return {
    name: typeof item?.name === 'string' && item.name ? item.name : typeof item?.title === 'string' ? item.title : '未知歌曲',
    artist: typeof item?.artist === 'string' && item.artist ? item.artist : typeof item?.author === 'string' ? item.author : '未知歌手',
    url,
    cover: String(item?.pic ?? item?.picture ?? item?.cover ?? ''),
    lrc: String(item?.lrc ?? item?.lyric ?? '')
  }
}

/** 拉取歌单：缓存命中直接返回；否则按接口顺序尝试；全失败回退内置音源 */
export async function loadPlaylist(playlistId: string, apis: string[]): Promise<TrackItem[]> {
  const cached = readCache()
  if (cached && cached.playlistId === playlistId && Date.now() - cached.ts < TTL) return cached.tracks

  for (const api of apis) {
    try {
      const res = await fetch(`${api.replace(/\/+$/, '')}/?server=netease&type=playlist&id=${playlistId}`)
      if (!res.ok) continue
      const data = (await res.json()) as RawTrack[]
      const tracks = (Array.isArray(data) ? data : []).map(normalize).filter((t): t is TrackItem => t !== null)
      if (tracks.length) {
        writeCache(playlistId, tracks)
        return tracks
      }
    } catch {
      /* 尝试下一个接口 */
    }
  }

  if (cached) return cached.tracks
  return FALLBACK_TRACKS
}
