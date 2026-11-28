<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import HeroBanner from '@/components/home/HeroBanner.vue'
import CategoryPills from '@/components/home/CategoryPills.vue'
import FeaturedSection from '@/components/home/FeaturedSection.vue'
import PostGrid from '@/components/home/PostGrid.vue'
import { articlesService } from '@/services/articles'
import { restoreScroll, saveScroll } from '@/lib/scrollMemory'
import type { Article } from '@/types/article'

const route = useRoute()
const router = useRouter()

const articles = ref<Article[]>([])
const loading = ref(false)

/** 搜索关键词（来自顶栏搜索框的 query 参数） */
const keyword = ref('')

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  void loadArticles()
  keyword.value = typeof route.query.q === 'string' ? route.query.q : ''
})

/* ---- 滚动记忆：内容渲染完成后恢复上次位置，滚动时 rAF 节流保存 ---- */
const restoreDone = ref(false)
let raf = 0

function tryRestore(): void {
  if (restoreDone.value || loading.value) return
  restoreDone.value = true
  const y = restoreScroll('home')
  if (y !== null) window.scrollTo(0, y)
}

function onScroll(): void {
  if (raf) return
  raf = window.requestAnimationFrame(() => {
    raf = 0
    saveScroll('home', window.scrollY)
  })
}

watch(loading, () => {
  if (!loading.value) window.requestAnimationFrame(tryRestore)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  if (raf) window.cancelAnimationFrame(raf)
  saveScroll('home', window.scrollY)
})

watch(
  () => route.query.q,
  (q) => {
    keyword.value = typeof q === 'string' ? q : ''
  }
)

async function loadArticles(): Promise<void> {
  loading.value = true
  try {
    articles.value = await articlesService.getAllPublished()
  } finally {
    loading.value = false
  }
}

/* ---- 分类（从文章数据自动推导，无需单独建表） ---- */
const cat = computed(() => {
  const c = typeof route.query.cat === 'string' ? route.query.cat : ''
  return c
})

const categories = computed<Array<{ value: string; label: string }>>(() => {
  const map = new Map<string, number>()
  for (const a of articles.value) {
    const v = a.category && a.category !== 'article' ? a.category : 'article'
    map.set(v, (map.get(v) ?? 0) + 1)
  }
  const labels: Record<string, string> = { article: '文章' }
  return [...map.entries()]
    .map(([value]) => ({ value, label: labels[value] ?? value }))
    .sort((a, b) => (b.value === 'article' ? 1 : 0) - (a.value === 'article' ? 1 : 0))
})

function selectCategory(value: string): void {
  void router.push({ path: '/', query: value ? { cat: value } : {} })
}

/* ---- 焦点区素材：有 featured/pinned 用配置，否则按播放量自动取（未配置时也有完整体验） ---- */
const carouselArticles = computed<Article[]>(() => {
  const featured = articles.value.filter((a) => a.featured)
  if (featured.length) return featured
  return [...articles.value].sort((a, b) => b.views - a.views).slice(0, 3)
})

const pinnedArticles = computed<Article[]>(() => {
  const pinned = articles.value.filter((a) => a.pinned)
  if (pinned.length) return pinned.slice(0, 6)
  const usedIds = new Set(carouselArticles.value.map((a) => a.id))
  return articles.value
    .filter((a) => !usedIds.has(a.id))
    .sort((a, b) => b.views - a.views)
    .slice(0, 6)
})

const showFeatured = computed(() => !cat.value && !keyword.value.trim())

/* ---- 列表过滤 ---- */
const visibleArticles = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return articles.value.filter((a) => {
    if (cat.value && (a.category ?? 'article') !== cat.value) return false
    if (kw) {
      const haystack = [a.title, a.description ?? '', ...(a.tags ?? [])].join(' ').toLowerCase()
      if (!haystack.includes(kw)) return false
    }
    return true
  })
})

const heading = computed(() => {
  if (keyword.value.trim()) return `搜索「${keyword.value.trim()}」`
  if (cat.value) return categories.value.find((c) => c.value === cat.value)?.label ?? cat.value
  return '最近更新'
})
</script>

<template>
  <div>
    <HeroBanner />

    <CategoryPills :categories="categories" :active="cat" @select="selectCategory" />

    <div class="mx-auto max-w-[1240px] px-4 pb-24 md:px-8 lg:px-10">
      <FeaturedSection v-if="showFeatured" :featured="carouselArticles" :pinned="pinnedArticles" class="mt-5 md:mt-7" />

      <!-- 动态标题 -->
      <div class="mt-6 flex flex-wrap items-center gap-3 md:mt-8">
        <h2 class="flex items-center gap-2 text-xl font-bold text-ink md:text-2xl">
          <span class="h-4 w-1 rounded-full bg-bili-pink md:h-5"></span>{{ heading }}
        </h2>
        <span class="text-xs text-ink-3">{{ visibleArticles.length }} 篇</span>
        <button
          v-if="!showFeatured"
          type="button"
          class="text-xs text-bili-blue hover:underline"
          @click="router.push('/')"
        >
          返回全部
        </button>
      </div>

      <!-- 文章网格 -->
      <div class="mt-4 md:mt-5">
        <div v-if="loading" class="py-20 text-center text-sm text-ink-3">加载中…</div>
        <PostGrid v-else-if="visibleArticles.length" :articles="visibleArticles" />
        <div v-else class="py-20 text-center">
          <div class="text-5xl">🔍</div>
          <p class="mt-3 text-sm text-ink-3">
            {{ keyword ? '没有找到相关内容' : '暂无文章' }}
          </p>
          <button
            v-if="!loading"
            type="button"
            class="mt-4 rounded-full bg-bili-pink px-5 py-2 text-sm text-white transition-opacity hover:opacity-90"
            @click="router.push('/')"
          >
            看看全部文章
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
