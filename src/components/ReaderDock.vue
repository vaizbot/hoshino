<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { requestTTS } from '@/services/tts'
import type { TtsVoice } from '@/services/tts'
import { buildChunks } from '@/utils/chunks'
import { AUDIO_EVENT, notifyAudioStart } from '@/lib/music'
import type { Article } from '@/types/article'

const props = defineProps<{
  article: Article | null
  voice?: TtsVoice
}>()

const chunks = ref<string[]>([])
const chunkIndex = ref(0)
const status = ref<'idle' | 'loading' | 'playing' | 'paused'>('idle')
const errorMessage = ref('')
const objectUrls: string[] = []
let audio: HTMLAudioElement | null = null
let stopped = false

const progress = computed(() =>
  chunks.value.length > 0 ? (chunkIndex.value + 1) / chunks.value.length : 0
)

/** 切文章 / 换声线 / 离开页面：停止并清理 */
watch(
  () => props.article,
  () => {
    stop()
  }
)
watch(
  () => props.voice,
  () => {
    stop()
  }
)

function cleanupAudio(): void {
  if (audio) {
    audio.pause()
    audio.src = ''
    audio = null
  }
  for (const url of objectUrls) URL.revokeObjectURL(url)
  objectUrls.length = 0
}

function stop(): void {
  stopped = true
  cleanupAudio()
  status.value = 'idle'
  chunkIndex.value = 0
  errorMessage.value = ''
}

async function start(chunkIndexStart = 0): Promise<void> {
  if (!props.article) return
  chunks.value = buildChunks(props.article.content)
  chunkIndex.value = Math.max(0, Math.min(chunkIndexStart, chunks.value.length - 1))
  stopped = false
  errorMessage.value = ''
  await playChunk()
}

/** 逐段合成 + 顺序播放（每段独立缓存，二次朗读直接命中缓存） */
async function playChunk(): Promise<void> {
  if (!props.article || stopped) return
  if (chunkIndex.value >= chunks.value.length) {
    stop()
    return
  }
  status.value = 'loading'
  try {
    const chunk = chunks.value[chunkIndex.value]
    if (chunk === undefined) {
      stop()
      return
    }
    const result = await requestTTS(
      props.article.id,
      chunk,
      'zh',
      chunkIndex.value,
      props.voice ?? 'mandarin'
    )
    if (stopped) {
      URL.revokeObjectURL(result.objectUrl)
      return
    }
    objectUrls.push(result.objectUrl)
    audio = new Audio(result.objectUrl)
    audio.onended = () => {
      if (stopped) return
      chunkIndex.value += 1
      void playChunk()
    }
    await audio.play()
    // 通知全站：朗读开始（音乐播放器收到后自动暂停）
    notifyAudioStart('tts')
    status.value = 'playing'
  } catch (error) {
    if (stopped) return
    status.value = 'idle'
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

function toggle(): void {
  if (status.value === 'idle') void start()
  else if (status.value === 'playing') {
    audio?.pause()
    status.value = 'paused'
  } else if (status.value === 'paused') {
    void audio?.play()
    status.value = 'playing'
  } else if (status.value === 'loading') {
    stop()
  }
}

onBeforeUnmount(() => {
  stop()
})

// 暴露给父组件：三连击段落 → 从指定段开始朗读
defineExpose({ start })

// 其他音源（音乐）开播 → 暂停朗读
function onOtherAudio(e: Event): void {
  const source = (e as CustomEvent<string>).detail
  if (source !== 'tts' && status.value === 'playing') {
    audio?.pause()
    status.value = 'paused'
  }
}

window.addEventListener(AUDIO_EVENT, onOtherAudio)

onBeforeUnmount(() => {
  window.removeEventListener(AUDIO_EVENT, onOtherAudio)
})
</script>

<template>
  <div v-if="article" class="fixed right-6 bottom-6 z-50 flex flex-col items-end gap-2">
    <button
      v-if="status !== 'idle'"
      type="button"
      class="rounded-full bg-white px-3 py-1.5 text-xs text-bili-text2 shadow-md transition-colors hover:text-bili-pink"
      @click="stop"
    >
      停止朗读
    </button>

    <p
      v-if="errorMessage"
      class="max-w-56 rounded-lg bg-white px-3 py-1.5 text-xs text-bili-pink shadow-md"
    >
      {{ errorMessage }}
    </p>

    <button
      type="button"
      class="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-bili-pink to-bili-blue text-white shadow-lg transition-transform hover:scale-105"
      :title="
        status === 'idle'
          ? '朗读全文'
          : status === 'playing'
            ? '暂停'
            : status === 'paused'
              ? '继续'
              : '生成中…'
      "
      @click="toggle"
    >
      <!-- 进度环 -->
      <svg class="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="26" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="3" />
        <circle
          cx="28"
          cy="28"
          r="26"
          fill="none"
          stroke="white"
          stroke-width="3"
          stroke-linecap="round"
          :stroke-dasharray="2 * Math.PI * 26"
          :stroke-dashoffset="2 * Math.PI * 26 * (1 - progress)"
          class="transition-all duration-300"
        />
      </svg>

      <!-- 状态图标 -->
      <span v-if="status === 'playing'" class="text-lg">⏸</span>
      <span v-else-if="status === 'paused'" class="text-lg">▶</span>
      <span
        v-else-if="status === 'loading'"
        class="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
      ></span>
      <span v-else class="text-lg">▶</span>
    </button>
  </div>
</template>
