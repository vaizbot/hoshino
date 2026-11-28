<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  currentTrack,
  lyrics,
  music,
  next,
  playAt,
  prev,
  seek,
  setLoop,
  setVolume,
  toggle
} from '@/lib/music'
import type { LoopMode } from '@/lib/music'

/**
 * 音乐播放器（95% 透明玻璃，与旧站同规格）：
 * - 收纳态：粉蓝 conic-gradient 进度环悬浮球，播放时 EQ 跳动
 * - 展开态：毛玻璃卡片（封面/歌名/歌手 + 双行歌词 + 细线图标控制 + 进度 + 歌单 + 音量）
 * - 点击卡片外任意位置自动收纳
 */

const open = ref(false)
const listOpen = ref(false)
const showLyrics = ref(false)
const root = ref<HTMLElement | null>(null)

/** PC / 手机布局区分（手机端悬浮球抬到回顶键上方） */
const mq = window.matchMedia('(min-width: 768px)')
const isDesktop = ref(mq.matches)
const onMq = (e: MediaQueryListEvent): void => {
  isDesktop.value = e.matches
}

const track = computed(() => currentTrack())
const playing = computed(() => music.playing)
const progressPct = computed(() => (music.duration > 0 ? Math.min(100, (music.time / music.duration) * 100) : 0))

const fmt = (s: number): string =>
  Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00'

function onSeek(e: MouseEvent): void {
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * music.duration)
}

function onVolume(e: Event): void {
  setVolume(Number((e.target as HTMLInputElement).value))
}

const LOOP_ORDER: LoopMode[] = ['list', 'one', 'random']
const loopTitle = computed(() => (music.loop === 'one' ? '单曲循环' : music.loop === 'random' ? '随机播放' : '列表循环'))
const loopIs = computed(() => music.loop)

function onLoop(): void {
  setLoop(LOOP_ORDER[(LOOP_ORDER.indexOf(music.loop) + 1) % LOOP_ORDER.length])
}

/** 歌词两行：当前 + 下一句（无歌词降级歌名/歌手） */
const twoLines = computed(() => {
  const all = lyrics()
  void music.lyricVersion
  const idx = music.lyricIndex
  if (!all.length) {
    return [
      { text: track.value?.name ?? '加载歌单中…', current: true },
      { text: track.value?.artist ?? '', current: false }
    ]
  }
  return [
    { text: all[idx]?.text ?? '', current: true },
    { text: all[idx + 1]?.text ?? '', current: false }
  ]
})

const oneLine = computed(() => twoLines.value[0]?.text ?? '')
const subline = computed(() => (music.buffering && playing.value ? '缓冲中…' : (track.value?.artist ?? '')))

const ballStyle = computed(() => ({
  background: `conic-gradient(#FB7299 0%, #00AEEC ${progressPct.value}%, rgba(229,232,237,0.75) ${progressPct.value}%)`
}))

function collapse(): void {
  open.value = false
  listOpen.value = false
}

function onDocPointer(e: PointerEvent): void {
  if (!open.value && !listOpen.value) return
  if (root.value && !root.value.contains(e.target as Node)) collapse()
}

onMounted(() => {
  mq.addEventListener('change', onMq)
  document.addEventListener('pointerdown', onDocPointer)
})
onBeforeUnmount(() => {
  mq.removeEventListener('change', onMq)
  document.removeEventListener('pointerdown', onDocPointer)
})
watch(open, (v) => {
  if (!v) listOpen.value = false
})
</script>

<template>
  <!-- 容器：PC 左下 / 手机左下（音乐球独占左下角） -->
  <div ref="root" class="fixed z-[56]" :class="isDesktop ? 'bottom-4 left-4' : 'bottom-3 left-3'">
    <!-- 悬浮歌词（默认关闭） -->
    <div
      v-if="showLyrics && !open"
      class="pointer-events-none absolute bottom-full left-0 mb-2 w-[300px] max-w-[calc(100vw-24px)] truncate text-sm font-medium text-bili-pink drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)] dark:drop-shadow-none"
    >
      {{ oneLine }}
    </div>

    <!-- 歌单：卡片正上方延展（95% 透明） -->
    <div
      v-if="open && listOpen"
      class="absolute bottom-full left-0 z-20 mb-2 w-full min-w-[260px] max-w-[calc(100vw-24px)] rounded-xl border border-white/50 bg-surface/5 p-1 shadow-xl backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/10"
    >
      <div class="thin-scroll max-h-40 overflow-y-auto">
        <button
          v-for="(t, i) in music.tracks"
          :key="`${t.url}-${i}`"
          type="button"
          class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/30 dark:hover:bg-white/10"
          @click="playAt(i)"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs" :class="i === music.index ? 'font-medium text-bili-pink' : 'text-ink'">
              {{ t.name }}
            </span>
            <span class="block truncate text-[10px] text-ink-3">{{ t.artist }}</span>
          </span>
          <svg
            v-if="i === music.index && playing"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.8"
            stroke="currentColor"
            class="h-3 w-3 shrink-0 text-bili-pink"
          >
            <path d="M11 5 6 9H2v6h4l5 4V5z" stroke-linejoin="round" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke-linecap="round" />
          </svg>
        </button>
        <p v-if="!music.tracks.length" class="px-3 py-4 text-center text-xs text-ink-3">加载歌单中…</p>
      </div>
    </div>

    <!-- 展开卡片：95% 透明 -->
    <div
      v-if="open"
      class="relative z-10 w-[300px] max-w-[calc(100vw-24px)] rounded-2xl border border-white/50 bg-surface/5 p-2.5 shadow-2xl backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/10"
    >
      <!-- 封面 / 歌名 / 歌手 -->
      <div class="flex items-center gap-2">
        <img v-if="track?.cover" :src="track.cover" alt="" class="h-8 w-8 shrink-0 rounded-md object-cover" />
        <span v-else class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bili-pink/10 text-bili-pink">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-3.5 w-3.5">
            <path d="M9 18V5l12-2v13" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-semibold leading-4 text-ink">{{ track ? track.name : '加载歌单中…' }}</p>
          <p class="truncate text-[10px] leading-4 text-ink-3">{{ subline }}</p>
        </div>
        <button type="button" class="a-icon-btn !h-7 !w-7" :class="showLyrics ? 'text-bili-pink' : ''" title="悬浮歌词" @click="showLyrics = !showLyrics">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-3.5 w-3.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linejoin="round" />
            <path d="M14 2v6h6" stroke-linejoin="round" />
            <path d="M16 13H8M16 17H8M10 9H8" stroke-linecap="round" />
          </svg>
        </button>
        <button type="button" class="a-icon-btn !h-7 !w-7" title="收纳成球" @click="collapse">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-3.5 w-3.5">
            <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <!-- 双行歌词（与音频时间同步） -->
      <div class="mt-1 h-8 overflow-hidden text-center">
        <p class="truncate text-[11px] leading-4" :class="twoLines[0].current ? 'font-medium text-bili-pink' : 'text-ink-3'">
          {{ twoLines[0].text }}
        </p>
        <p class="truncate text-[11px] leading-4 text-ink-3/80">{{ twoLines[1].text }}</p>
      </div>

      <!-- 控制行：切歌键 + 音量 + 听歌模式（36×36 细线图标） -->
      <div class="mt-0.5 flex items-center justify-between gap-1.5">
        <div class="flex items-center gap-1">
          <button type="button" class="a-icon-btn" aria-label="上一曲" @click="prev()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-4 w-4">
              <path d="M19 20 9 12l10-8v16z" stroke-linejoin="round" />
              <path d="M5 19V5" stroke-linecap="round" />
            </svg>
          </button>
          <button type="button" class="a-icon-btn" :class="playing ? 'text-bili-pink' : 'text-ink'" :aria-label="playing ? '暂停' : '播放'" @click="toggle()">
            <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <button type="button" class="a-icon-btn" aria-label="下一曲" @click="next()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-4 w-4">
              <path d="m5 4 10 8-10 8V4z" stroke-linejoin="round" />
              <path d="M19 5v14" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <!-- 音量（切歌键与听歌模式之间） -->
        <div class="flex min-w-0 flex-1 items-center gap-1.5 px-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.8"
            stroke="currentColor"
            class="h-3.5 w-3.5 shrink-0 text-ink-3"
          >
            <path d="M11 5 6 9H2v6h4l5 4V5z" stroke-linejoin="round" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke-linecap="round" />
          </svg>
          <input type="range" min="0" max="1" step="0.01" :value="music.volume" class="h-1 w-full cursor-pointer accent-pink-500" aria-label="音量" @input="onVolume" />
        </div>

        <div class="flex items-center gap-1">
          <button type="button" class="a-icon-btn" :title="loopTitle" @click="onLoop">
            <!-- 列表循环 -->
            <svg v-if="loopIs === 'list'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-4 w-4">
              <path d="m17 2 4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M3 11v-1a4 4 0 0 1 4-4h14" stroke-linecap="round" />
              <path d="m7 22-4-4 4-4" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M21 13v1a4 4 0 0 1-4 4H3" stroke-linecap="round" />
            </svg>
            <!-- 单曲循环 -->
            <svg v-else-if="loopIs === 'one'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-4 w-4">
              <path d="m17 2 4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M3 11v-1a4 4 0 0 1 4-4h14" stroke-linecap="round" />
              <path d="m7 22-4-4 4-4" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M21 13v1a4 4 0 0 1-4 4H3" stroke-linecap="round" />
              <text x="11.4" y="15.2" font-size="7" fill="currentColor" stroke="none" text-anchor="middle">1</text>
            </svg>
            <!-- 随机播放 -->
            <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-4 w-4">
              <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22" stroke-linecap="round" />
              <path d="m18 2 4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" stroke-linecap="round" />
              <path d="M22 18h-5.9c-1.3 0-2.5-.6-3.3-1.7l-.5-.8" stroke-linecap="round" />
              <path d="m18 14 4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button type="button" class="a-icon-btn" :class="listOpen ? 'text-bili-pink' : ''" aria-label="歌单" @click="listOpen = !listOpen">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-4 w-4">
              <path d="M8 6h13M8 12h13M8 18h13" stroke-linecap="round" />
              <path d="M3 6h.01M3 12h.01M3 18h.01" stroke-linecap="round" stroke-width="2.4" />
            </svg>
          </button>
        </div>
      </div>

      <!-- 进度 -->
      <div class="mt-1 cursor-pointer py-0.5" @click="onSeek">
        <div class="relative h-1 rounded-full bg-surface-2/70">
          <div class="absolute inset-y-0 left-0 rounded-full bg-bili-pink" :style="{ width: progressPct + '%' }"></div>
        </div>
      </div>
      <div class="flex justify-between text-[9px] leading-3 tabular-nums text-ink-3">
        <span>{{ fmt(music.time) }}</span>
        <span>{{ fmt(music.duration) }}</span>
      </div>
    </div>

    <!-- 收纳态：悬浮球（粉蓝进度环 + EQ 跳动） -->
    <button
      v-else
      type="button"
      class="relative flex h-12 w-12 items-center justify-center rounded-full p-[3px] shadow-lg transition-transform hover:scale-105 active:scale-95"
      :style="ballStyle"
      :title="track ? `正在播放：${track.name}` : '打开播放器'"
      @click="open = true"
    >
      <span class="flex h-full w-full items-center justify-center rounded-full bg-surface text-bili-pink dark:bg-slate-900">
        <span v-if="playing" class="flex h-5 items-end gap-0.5">
          <span class="eq-bar w-0.5 rounded-full bg-bili-pink" style="animation-delay: 0s"></span>
          <span class="eq-bar w-0.5 rounded-full bg-bili-pink" style="animation-delay: 0.2s"></span>
          <span class="eq-bar w-0.5 rounded-full bg-bili-pink" style="animation-delay: 0.4s"></span>
        </span>
        <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-[18px] w-[18px]">
          <path d="M9 18V5l12-2v13" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </span>
    </button>
  </div>
</template>

<style scoped>
.eq-bar {
  height: 6px;
  animation: eq 0.9s ease-in-out infinite;
}
@keyframes eq {
  0%,
  100% {
    height: 5px;
  }
  50% {
    height: 15px;
  }
}
</style>
