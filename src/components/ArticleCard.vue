<script setup lang="ts">
import { computed } from 'vue'

import { formatCount, formatDate } from '@/utils/format'
import type { Article } from '@/types/article'

const props = defineProps<{
  article: Article
}>()

/** 封面双色（无图时用渐变封面） */
const coverColors = computed<[string, string]>(() => {
  const colors = props.article.cover_colors
  if (Array.isArray(colors) && colors.length >= 2) {
    const norm = (c: string): string => (c.startsWith('#') ? c : `#${c}`)
    return [norm(colors[0] ?? ''), norm(colors[1] ?? '')]
  }
  return ['#FB7299', '#00AEEC']
})

const coverIcon = computed(() => props.article.cover_icon || '📄')

const categoryLabel = computed(() => {
  const cat = props.article.category
  return cat && cat !== 'article' ? cat : '文章'
})

const tags = computed(() => (props.article.tags ?? []).slice(0, 2))
</script>

<template>
  <RouterLink
    :to="{ name: 'article-detail', params: { id: article.id } }"
    class="group mb-4 inline-block w-full break-inside-avoid md:mb-0"
  >
    <article
      class="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(16,24,40,0.1)]"
    >
      <!-- 封面：16:9；无图时渐变 + emoji -->
      <div class="relative aspect-video overflow-hidden">
        <img
          v-if="article.cover_url"
          :src="article.cover_url"
          :alt="article.title"
          loading="lazy"
          class="h-full w-full object-cover"
        />
        <div v-else class="relative h-full w-full" :style="{ background: `linear-gradient(135deg, ${coverColors[0]}, ${coverColors[1]})` }">
          <span
            class="absolute right-2 bottom-1 rotate-6 text-4xl opacity-80 transition-transform duration-300 group-hover:rotate-0 group-hover:scale-110"
          >
            {{ coverIcon }}
          </span>
          <div
            class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_60%)]"
          ></div>
        </div>

        <!-- 分类 chip -->
        <span class="absolute top-2 left-2 rounded-full border border-white/30 bg-black/20 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
          {{ categoryLabel }}
        </span>

        <!-- 底部信息条 -->
        <div class="absolute inset-x-0 bottom-0 flex h-10 items-end justify-between bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-1.5">
          <span class="inline-flex items-center gap-1 text-xs text-white">
            <svg viewBox="0 0 24 24" fill="currentColor" class="h-3 w-3">
              <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11.2-6.86a1.04 1.04 0 000-1.76L9.56 4.26A1.04 1.04 0 008 5.14z" />
            </svg>
            {{ formatCount(article.views) }}
          </span>
          <span class="text-xs text-white/85">{{ formatDate(article.created_at) }} · {{ article.read_minutes ?? 5 }} 分钟</span>
        </div>
      </div>

      <div class="p-3">
        <!-- 标题：两行截断，hover 变粉 -->
        <h3 class="clamp-2 h-[42px] font-semibold leading-snug text-ink transition-colors group-hover:text-bili-pink">
          {{ article.title }}
        </h3>
        <!-- 简介：两行截断 -->
        <p v-if="article.description" class="clamp-2 mt-1 h-9 text-xs leading-relaxed text-ink-2">
          {{ article.description }}
        </p>
        <!-- 标签 -->
        <div v-if="tags.length" class="mt-2 flex flex-wrap gap-1.5">
          <span
            v-for="t in tags"
            :key="t"
            class="rounded-full bg-bili-pink/10 px-2 py-0.5 text-[11px] text-bili-pink"
          >
            {{ t }}
          </span>
        </div>
      </div>
    </article>
  </RouterLink>
</template>
