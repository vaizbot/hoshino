<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { formatCount, formatDate } from '@/utils/format'
import type { Article } from '@/types/article'

/** 首页焦点区：左侧 16:8 大图轮播（自动播放 + hover 暂停）+ 右侧 6 格置顶 */

const props = defineProps<{
  featured: Article[]
  pinned: Article[]
}>()

const router = useRouter()

const idx = ref(0)
const hover = ref(false)
let timer = 0

function stop(): void {
  if (timer) {
    window.clearInterval(timer)
    timer = 0
  }
}

function start(): void {
  stop()
  const n = props.featured.length
  if (n <= 1) return
  timer = window.setInterval(() => {
    idx.value = (idx.value + 1) % n
  }, 4500)
}

onMounted(start)
onBeforeUnmount(stop)

function goto(i: number): void {
  idx.value = i
  start()
}

function prev(): void {
  const n = props.featured.length
  idx.value = (idx.value - 1 + n) % n
  start()
}

function next(): void {
  const n = props.featured.length
  idx.value = (idx.value + 1) % n
  start()
}

function coverColors(a: Article): [string, string] {
  const colors = a.cover_colors
  if (Array.isArray(colors) && colors.length >= 2) {
    const norm = (c: string): string => (c.startsWith('#') ? c : `#${c}`)
    return [norm(colors[0] ?? ''), norm(colors[1] ?? '')]
  }
  return ['#FB7299', '#00AEEC']
}

const pinnedRows = computed(() => Math.max(1, Math.ceil(props.pinned.length / 2)))

function openArticle(a: Article): void {
  void router.push({ name: 'article-detail', params: { id: a.id } })
}

function onEnter(): void {
  hover.value = true
  stop()
}

function onLeave(): void {
  hover.value = false
  start()
}
</script>

<template>
  <section
    v-if="featured.length || pinned.length"
    class="grid gap-4 md:grid-cols-3"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <!-- 大图轮播 -->
    <div v-if="featured.length" class="relative aspect-[16/9] overflow-hidden rounded-xl md:col-span-2 md:aspect-[16/8]">
      <div
        v-for="(a, i) in featured"
        :key="a.id"
        class="absolute inset-0 cursor-pointer transition-opacity duration-700"
        :class="i === idx ? 'z-10 opacity-100' : 'pointer-events-none opacity-0'"
        @click="openArticle(a)"
      >
        <img v-if="a.cover_url" :src="a.cover_url" :alt="a.title" class="h-full w-full object-cover" />
        <div v-else class="relative h-full w-full" :style="{ background: `linear-gradient(120deg, ${coverColors(a)[0]}, ${coverColors(a)[1]})` }">
          <span class="absolute right-8 top-8 rotate-12 text-5xl opacity-60 drop-shadow-lg md:text-7xl">
            {{ a.cover_icon || '📄' }}
          </span>
        </div>
        <div class="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>
        <div class="absolute inset-x-0 bottom-0 left-4 right-4 p-3 text-white">
          <span class="rounded-full border border-white/20 px-2 py-0.5 text-xs backdrop-blur-sm">
            {{ a.category && a.category !== 'article' ? a.category : '文章' }}
          </span>
          <h3 class="line-clamp-2 mt-1.5 text-base leading-snug font-bold md:text-lg">{{ a.title }}</h3>
          <p class="mt-1 text-xs text-white/80">
            👁 {{ formatCount(a.views) }} · {{ formatDate(a.created_at) }}
          </p>
        </div>
      </div>

      <!-- hover 显示前后箭头 -->
      <button
        v-if="featured.length > 1"
        type="button"
        class="absolute top-1/2 left-3 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-lg text-white transition-all hover:bg-bili-pink"
        :class="hover ? 'opacity-100' : 'opacity-0'"
        aria-label="上一个"
        @click.stop="prev"
      >
        ‹
      </button>
      <button
        v-if="featured.length > 1"
        type="button"
        class="absolute top-1/2 right-3 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-lg text-white transition-all hover:bg-bili-pink"
        :class="hover ? 'opacity-100' : 'opacity-0'"
        aria-label="下一个"
        @click.stop="next"
      >
        ›
      </button>
      <!-- 底部指示条 -->
      <div v-if="featured.length > 1" class="absolute right-3 bottom-3 z-20 flex items-center gap-1.5">
        <button
          v-for="(a, i) in featured"
          :key="a.id"
          type="button"
          class="h-1.5 rounded-full transition-all"
          :class="i === idx ? 'w-5 bg-bili-pink' : 'w-1.5 bg-white/60 hover:bg-white'"
          :aria-label="`第 ${i + 1} 张`"
          @click.stop="goto(i)"
        ></button>
      </div>
    </div>

    <!-- 置顶列表：封面缩略图 + 序号角标 -->
    <div
      v-if="pinned.length"
      class="grid h-full grid-cols-2 auto-rows-fr items-stretch gap-2 md:gap-3"
      :style="{ gridTemplateRows: `repeat(${pinnedRows}, minmax(0, 1fr))` }"
    >
      <div
        v-for="(a, i) in pinned"
        :key="a.id"
        class="group flex min-h-0 cursor-pointer flex-col gap-1 rounded-xl border border-line bg-surface/85 p-1.5 transition-colors hover:border-bili-pink/50"
        @click="openArticle(a)"
      >
        <div class="relative min-h-20 min-w-0 flex-1 overflow-hidden rounded-lg md:min-h-0">
          <img v-if="a.cover_url" :src="a.cover_url" alt="" class="absolute inset-0 h-full w-full object-cover" />
          <div v-else class="absolute inset-0" :style="{ background: `linear-gradient(120deg, ${coverColors(a)[0]}, ${coverColors(a)[1]})` }">
            <span class="absolute right-1.5 bottom-1 text-2xl opacity-80">{{ a.cover_icon || '📄' }}</span>
          </div>
          <span class="absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-bili-pink/90 text-xs font-bold text-white">
            {{ i + 1 }}
          </span>
        </div>
        <h4 class="h-5 truncate text-xs leading-5 font-medium text-ink transition-colors group-hover:text-bili-pink">
          {{ a.title }}
        </h4>
      </div>
    </div>
  </section>
</template>
