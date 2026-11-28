<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { articlesService } from '@/services/articles'
import { requestTTS } from '@/services/tts'
import type { TtsVoice } from '@/services/tts'
import { requestTranslate } from '@/services/translate'
import ArticleCard from '@/components/ArticleCard.vue'
import ReaderDock from '@/components/ReaderDock.vue'
import CommentSection from '@/components/common/CommentSection.vue'
import { buildChunks } from '@/utils/chunks'
import { restoreScroll, saveScroll } from '@/lib/scrollMemory'
import { formatCount, formatDate } from '@/utils/format'
import type { Article } from '@/types/article'

const route = useRoute()
const router = useRouter()

const article = ref<Article | null>(null)
const recommendations = ref<Article[]>([])
const loading = ref(true)

/* ---- 封面自适应背景（颜色取自文章 cover_colors，缺省粉蓝兜底） ---- */
const coverColors = computed<[string, string]>(() => {
  const colors = article.value?.cover_colors
  if (Array.isArray(colors) && colors.length >= 2) {
    const norm = (c: string): string => (c.startsWith('#') ? c : `#${c}`)
    return [norm(colors[0] ?? ''), norm(colors[1] ?? '')]
  }
  return ['#FB7299', '#00AEEC']
})

const coverIcon = computed(() => article.value?.cover_icon || '📄')

const categoryLabel = computed(() => {
  const cat = article.value?.category
  return cat && cat !== 'article' ? cat : '文章'
})

const bgStyle = computed(() => ({
  background: `linear-gradient(135deg, ${coverColors.value[0]}38 0%, ${coverColors.value[1]}24 45%, #ffffff 100%)`
}))

const bgStyleDark = computed(() => ({
  background: `linear-gradient(135deg, ${coverColors.value[0]}22 0%, #020617 60%, #020617 100%)`
}))

/* ---- 正文 / 翻译 ---- */
const translating = ref(false)
const translateError = ref('')
/** 当前展示的译文（null 表示显示原文） */
const translation = ref<{ lang: 'zh' | 'en'; text: string } | null>(null)

const displayText = computed(() => translation.value?.text ?? article.value?.content ?? '')
const paragraphs = computed(() =>
  displayText.value
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
)

/* ---- 音频与声线 ---- */
const audioRef = ref<HTMLAudioElement | null>(null)
const ttsObjectUrl = ref('')
const ttsLoading = ref(false)
const ttsError = ref('')

const VOICE_OPTIONS: Array<{ id: TtsVoice; label: string }> = [
  { id: 'mandarin', label: '普通话' },
  { id: 'wu', label: '吴侬软语' },
  { id: 'english', label: 'English' },
  { id: 'japanese', label: '日本語' },
  { id: 'korean', label: '한국어' }
]
const voice = ref<TtsVoice>('mandarin')

onBeforeUnmount(() => {
  if (ttsObjectUrl.value) URL.revokeObjectURL(ttsObjectUrl.value)
})

/* ---- 数据加载 ---- */
async function loadDetail(id: string): Promise<void> {
  loading.value = true
  article.value = null
  translation.value = null // 切文章时回到原文显示
  currentId = id
  try {
    const [current, all] = await Promise.all([
      articlesService.getById(id),
      articlesService.getAllPublished()
    ])

    article.value = current
    // 相关推荐：同分类优先，其余按播放量补位
    recommendations.value = all
      .filter((a) => a.id !== id)
      .sort((a, b) => {
        if (current) {
          const ca = a.category === current.category ? 1 : 0
          const cb = b.category === current.category ? 1 : 0
          if (ca !== cb) return cb - ca
        }
        return b.views - a.views
      })
      .slice(0, 3)

    if (current) {
      applySeoMeta(current)
      // 播放量 +1：同一会话内同一文章只计一次
      const viewedKey = `viewed:${id}`
      if (!sessionStorage.getItem(viewedKey)) {
        sessionStorage.setItem(viewedKey, '1')
        void articlesService.incrementViews(id)
        article.value = { ...current, views: current.views + 1 }
      }

      // 恢复上次阅读位置
      await nextTick()
      const y = restoreScroll(`article:${id}`)
      if (y !== null) window.scrollTo(0, y)
    }
  } finally {
    loading.value = false
  }
}

/* ---- 滚动记忆（每篇文章各自保存） ---- */
let currentId = ''
let scrollRaf = 0

function onScroll(): void {
  if (scrollRaf) return
  scrollRaf = window.requestAnimationFrame(() => {
    scrollRaf = 0
    if (currentId) saveScroll(`article:${currentId}`, window.scrollY)
  })
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  const id = typeof route.params.id === 'string' ? route.params.id : ''
  void loadDetail(id)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  if (scrollRaf) window.cancelAnimationFrame(scrollRaf)
  if (currentId) saveScroll(`article:${currentId}`, window.scrollY)
})

watch(
  () => route.params.id,
  (newId) => {
    const id = typeof newId === 'string' ? newId : ''
    if (id) void loadDetail(id)
  }
)
function applySeoMeta(a: Article): void {
  document.title = `${a.title} · VaizBot`
  const desc = a.description || a.title
  const setMeta = (key: string, content: string, attr: 'name' | 'property' = 'name'): void => {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute(attr, key)
      document.head.appendChild(el)
    }
    el.setAttribute('content', content)
  }
  setMeta('description', desc)
  setMeta('og:title', document.title, 'property')
  setMeta('og:description', desc, 'property')
  setMeta('og:type', 'article', 'property')
}

/* ---- 返回 / 分享 ---- */
function goBack(): void {
  if (window.history.length > 1) router.back()
  else void router.push({ name: 'home' })
}

const sharedTip = ref(false)

async function share(): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href)
    sharedTip.value = true
    window.setTimeout(() => {
      sharedTip.value = false
    }, 2000)
  } catch {
    /* 复制失败静默忽略 */
  }
}

/* ---- 三连击朗读：连点段落 3 次，从该段开始朗读全文 ---- */
const readerDockRef = ref<InstanceType<typeof ReaderDock> | null>(null)
const clickMap = new Map<number, { count: number; ts: number }>()

function onParaClick(index: number, text: string): void {
  if (!article.value || translation.value) return // 译文状态不支持三连击（避免与原文错位）
  const now = Date.now()
  const rec = clickMap.get(index)
  if (!rec || now - rec.ts > 1000) {
    clickMap.set(index, { count: 1, ts: now })
    return
  }
  rec.count += 1
  rec.ts = now
  if (rec.count < 3) return
  clickMap.delete(index)

  const chunks = buildChunks(article.value.content)
  const prefix = text.slice(0, 20)
  const chunkIdx = chunks.findIndex((c) => c.includes(prefix))
  void readerDockRef.value?.start(chunkIdx >= 0 ? chunkIdx : 0)
}

/* ---- 朗读 / 翻译 ---- */
async function readAloud(): Promise<void> {
  if (!article.value) return
  ttsLoading.value = true
  ttsError.value = ''
  try {
    const result = await requestTTS(article.value.id, article.value.content, 'zh', undefined, voice.value)

    if (ttsObjectUrl.value) URL.revokeObjectURL(ttsObjectUrl.value)
    ttsObjectUrl.value = result.objectUrl

    if (result.audioUrl) {
      article.value = { ...article.value, audio_url: result.audioUrl }
    }

    await nextTick()
    void audioRef.value?.play()
  } catch (error) {
    ttsError.value = error instanceof Error ? error.message : String(error)
  } finally {
    ttsLoading.value = false
  }
}

/** 与 Worker 相同的判定规则：中文字符占比 > 30% 视为中文 */
function detectChinese(text: string): boolean {
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length
  const total = text.replace(/\s/g, '').length
  return total > 0 && chinese / total > 0.3
}

const targetLang = computed<'zh' | 'en'>(() => {
  if (!article.value) return 'zh'
  return detectChinese(article.value.content) ? 'en' : 'zh'
})

async function translate(): Promise<void> {
  if (!article.value) return
  translating.value = true
  translateError.value = ''
  try {
    const result = await requestTranslate(article.value.id, targetLang.value)
    translation.value = { lang: result.targetLang, text: result.translation }
  } catch (error) {
    translateError.value = error instanceof Error ? error.message : String(error)
  } finally {
    translating.value = false
  }
}

function showOriginal(): void {
  translation.value = null
}
</script>

<template>
  <div class="relative isolate mx-auto min-h-screen max-w-[1000px] px-4 py-5 md:px-6 md:py-8">
    <!-- 跟随封面自适应的渐变背景（明暗两套） -->
    <div aria-hidden="true" class="pointer-events-none fixed inset-0 -z-10 dark:hidden" :style="bgStyle"></div>
    <div aria-hidden="true" class="pointer-events-none fixed inset-0 -z-10 hidden dark:block" :style="bgStyleDark"></div>

    <!-- 返回 / 分享 -->
    <div class="relative flex items-center justify-between">
      <button class="a-icon-btn" aria-label="返回" @click="goBack">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-4 w-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
      <button class="a-icon-btn" aria-label="分享" @click="share">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-4 w-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
        </svg>
      </button>
    </div>

    <!-- 加载中 / 未找到 -->
    <div v-if="loading" class="py-24 text-center text-sm text-ink-3">文章加载中…</div>
    <div v-else-if="!article" class="py-24 text-center">
      <div class="text-5xl">🍃</div>
      <p class="mt-3 text-sm text-ink-3">文章不存在或已删除</p>
      <RouterLink
        to="/"
        class="mt-4 inline-block rounded-full bg-bili-pink px-5 py-2 text-sm text-white transition-opacity hover:opacity-90"
      >
        返回首页
      </RouterLink>
    </div>

    <template v-else>
      <!-- 毛玻璃阅读卡 -->
      <article class="glass-card mt-4 p-3 md:p-5">
        <!-- 封面 banner：21:9（移动端 16:9） -->
        <div class="relative aspect-video overflow-hidden rounded-xl md:aspect-[21/9]">
          <img
            v-if="article.cover_url"
            :src="article.cover_url"
            :alt="article.title"
            class="absolute inset-0 h-full w-full object-cover"
          />
          <div
            v-else
            class="absolute inset-0"
            :style="{ background: `linear-gradient(120deg, ${coverColors[0]}, ${coverColors[1]})` }"
          >
            <span class="absolute right-6 bottom-6 rotate-6 text-6xl opacity-70 drop-shadow-lg md:right-10 md:bottom-10 md:text-8xl">
              {{ coverIcon }}
            </span>
          </div>
          <span class="absolute top-3 left-3 rounded-full bg-black/25 px-2.5 py-1 text-xs text-white backdrop-blur">
            {{ categoryLabel }}
          </span>
          <div class="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent"></div>
          <div class="absolute inset-x-0 bottom-0 flex items-center justify-between px-3 pb-2.5 text-xs text-white md:px-4 md:pb-3">
            <span class="flex items-center gap-3">
              <span class="inline-flex items-center gap-1">
                <svg viewBox="0 0 24 24" fill="currentColor" class="h-3.5 w-3.5">
                  <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11.2-6.86a1.04 1.04 0 000-1.76L9.56 4.26A1.04 1.04 0 008 5.14z" />
                </svg>
                {{ formatCount(article.views) }}
              </span>
              <span>{{ formatDate(article.created_at) }}</span>
            </span>
            <span>{{ article.read_minutes ?? 5 }} 分钟</span>
          </div>
        </div>

        <h1 class="mt-5 text-2xl leading-snug font-bold text-ink md:text-4xl">{{ article.title }}</h1>

        <div v-if="article.tags && article.tags.length" class="mt-3 flex flex-wrap items-center gap-2">
          <span
            v-for="tag in article.tags"
            :key="tag"
            class="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-bili-blue dark:bg-slate-800"
          >
            {{ tag }}
          </span>
        </div>

        <!-- 正文：16-17px / 行高 1.85 / 首行缩进 / 两端对齐 / 最大宽 680 居中 -->
        <div class="mt-6 border-t border-line pt-6 md:mt-8">
          <div class="mx-auto max-w-[680px]">
            <p
              v-for="(paragraph, index) in paragraphs"
              :key="index"
              class="mb-4 text-[16px] leading-[1.85] text-justify indent-[2em] text-ink md:text-[17px]"
              :class="translation ? '' : 'cursor-pointer'"
              @click="onParaClick(index, paragraph)"
            >
              {{ paragraph }}
            </p>

            <!-- 来源节：灰字 chip -->
            <div v-if="article.source_url" class="mt-8 flex items-start gap-2.5 border-t border-line pt-4">
              <span class="mt-0.5 shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-3">
                来源
              </span>
              <a
                :href="article.source_url"
                target="_blank"
                rel="noopener noreferrer"
                class="min-w-0 text-xs leading-5 text-ink-3 transition-colors hover:text-bili-blue"
              >
                {{ article.source_name || article.source_url }}
              </a>
            </div>
          </div>
        </div>
      </article>

      <!-- 收听与工具（毛玻璃卡） -->
      <div class="glass-card mt-4 p-4 md:p-5">
        <h2 class="mb-3 flex items-center gap-2 text-base font-bold text-ink">
          <span class="h-4 w-1 rounded-full bg-bili-pink"></span>收听与工具
        </h2>

        <!-- 提示：三连击朗读 -->
        <p class="mb-3 text-xs text-ink-3">小技巧：连续点击正文任意段落三次，就从那里开始朗读 🎧</p>

        <audio
          ref="audioRef"
          :src="ttsObjectUrl || article.audio_url || ''"
          controls
          preload="none"
          class="w-full"
        >
          您的浏览器不支持 audio 标签
        </audio>

        <!-- 声线选择：五种声线 -->
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button
            v-for="option in VOICE_OPTIONS"
            :key="option.id"
            type="button"
            class="rounded-full border px-3 py-1 text-xs transition-colors"
            :class="
              voice === option.id
                ? 'border-bili-pink bg-bili-pink text-white'
                : 'border-line text-ink-2 hover:border-bili-blue hover:text-bili-blue'
            "
            @click="voice = option.id"
          >
            {{ option.label }}
          </button>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            :disabled="ttsLoading"
            class="rounded-full bg-bili-blue px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            @click="readAloud"
          >
            {{ ttsLoading ? '生成中…' : '用我的声音朗读' }}
          </button>

          <button
            type="button"
            :disabled="translating"
            class="rounded-full border border-bili-blue px-5 py-2 text-sm font-medium text-bili-blue transition-colors hover:bg-bili-blue/5 disabled:cursor-not-allowed disabled:opacity-60"
            @click="translate"
          >
            {{ translating ? '翻译中…' : `翻译成${targetLang === 'zh' ? '中文' : '英文'}` }}
          </button>

          <button
            v-if="translation"
            type="button"
            class="rounded-full border border-line px-5 py-2 text-sm font-medium text-ink-2 transition-colors hover:border-bili-blue hover:text-bili-blue"
            @click="showOriginal"
          >
            显示原文
          </button>
        </div>

        <p v-if="translation" class="mt-3 text-xs text-ink-3">
          当前显示：{{ translation.lang === 'zh' ? '中文译文' : '英文译文' }}（原文保存在 article.content，未修改）
        </p>
        <p v-if="ttsError" class="mt-3 text-xs text-bili-pink">{{ ttsError }}</p>
        <p v-if="translateError" class="mt-3 text-xs text-bili-pink">{{ translateError }}</p>
      </div>

      <!-- 评论区 -->
      <div class="mt-8">
        <h2 class="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
          <span class="h-5 w-1 rounded-full bg-bili-pink"></span>评论
        </h2>
        <CommentSection :post-id="article.id" />
      </div>

      <!-- 相关推荐 -->
      <div v-if="recommendations.length" class="mt-8">
        <h2 class="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
          <span class="h-5 w-1 rounded-full bg-bili-blue"></span>相关推荐
        </h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ArticleCard v-for="item in recommendations" :key="item.id" :article="item" />
        </div>
      </div>
    </template>

    <!-- 分享提示 -->
    <div
      v-if="sharedTip"
      class="fixed top-20 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-xs text-white"
    >
      链接已复制
    </div>

    <!-- 右下角朗读圈圈：跟随所选声线，支持三连击跳段 -->
    <ReaderDock ref="readerDockRef" :article="article" :voice="voice" />
  </div>
</template>
