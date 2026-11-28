<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { articlesService } from '@/services/articles'
import { requestTTS } from '@/services/tts'
import OverviewPanel from '@/components/admin/OverviewPanel.vue'
import { formatCount, formatDate } from '@/utils/format'
import type { Article } from '@/types/article'

const router = useRouter()
const authStore = useAuthStore()

const articles = ref<Article[]>([])
const loading = ref(false)
/** 正在执行写操作的文章 id；新增表单用 'create' 占位 */
const busyId = ref<string | null>(null)
/** 正在生成语音的文章 id */
const generatingId = ref<string | null>(null)
const tip = ref('')
const tipIsError = ref(false)

/** 新增文章表单 */
const newArticle = reactive({
  title: '',
  content: ''
})

onMounted(() => {
  void loadArticles()
})

/** 拉取全部文章（含草稿，依赖登录会话 + RLS 策略 authenticated_all） */
async function loadArticles(): Promise<void> {
  loading.value = true
  try {
    articles.value = await articlesService.getAll()
  } finally {
    loading.value = false
  }
}

function showTip(message: string, isError = false): void {
  tip.value = message
  tipIsError.value = isError
}

/** 新增文章 */
async function handleCreate(): Promise<void> {
  if (!newArticle.title.trim() || !newArticle.content.trim()) {
    showTip('标题和正文不能为空', true)
    return
  }
  busyId.value = 'create'
  try {
    const created = await articlesService.create({
      title: newArticle.title.trim(),
      content: newArticle.content.trim()
    })
    if (!created) {
      showTip('新增失败，请稍后重试', true)
      return
    }
    articles.value.unshift(created)
    newArticle.title = ''
    newArticle.content = ''
    showTip('文章已创建')
  } finally {
    busyId.value = null
  }
}

/** 切换发布状态（发布 / 下架） */
async function handleTogglePublished(article: Article): Promise<void> {
  busyId.value = article.id
  try {
    const updated = await articlesService.update(article.id, { published: !article.published })
    if (updated) {
      const index = articles.value.findIndex((a) => a.id === article.id)
      if (index !== -1) articles.value[index] = updated
    } else {
      showTip('切换发布状态失败', true)
    }
  } finally {
    busyId.value = null
  }
}

/** 删除文章 */
async function handleDelete(article: Article): Promise<void> {
  if (!window.confirm(`确定删除《${article.title}》？此操作不可恢复。`)) return
  busyId.value = article.id
  try {
    const ok = await articlesService.remove(article.id)
    if (ok) {
      articles.value = articles.value.filter((a) => a.id !== article.id)
      showTip('文章已删除')
    } else {
      showTip('删除失败，请稍后重试', true)
    }
  } finally {
    busyId.value = null
  }
}

/** 退出登录：onAuthStateChange 更新状态后，守卫会接管后续跳转 */
async function handleSignOut(): Promise<void> {
  await authStore.signOut()
  void router.push({ name: 'login' })
}

/**
 * 预生成语音：调 Workers /tts（R2 缓存 -> MiniMax 合成）
 * 成功后把 audio_url 写回 Supabase 对应记录（Workers 侧通常已写回，这里保证本地列表立即一致）
 */
async function handleGenerateTts(article: Article): Promise<void> {
  if (!article.content.trim()) {
    showTip('正文为空，无法生成语音', true)
    return
  }
  generatingId.value = article.id
  try {
    const result = await requestTTS(article.id, article.content, 'zh')
    // 后台预生成：不播放，释放本次的本地对象 URL
    URL.revokeObjectURL(result.objectUrl)

    const updated = await articlesService.update(article.id, { audio_url: result.audioUrl })
    if (updated) {
      const index = articles.value.findIndex((a) => a.id === article.id)
      if (index !== -1) articles.value[index] = updated
      showTip('语音已生成，audio_url 已写回')
    } else {
      showTip('语音已生成，但本地写回失败（Workers 侧通常已写回，可刷新确认）', true)
    }
  } catch (error) {
    showTip(error instanceof Error ? error.message : String(error), true)
  } finally {
    generatingId.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-5">
    <div class="mb-5 flex items-center justify-between">
      <h1 class="text-xl font-bold">管理后台</h1>
      <div class="flex items-center gap-3 text-sm text-bili-text2">
        <RouterLink
          to="/admin/writing"
          class="rounded-lg bg-bili-pink/10 px-3 py-1.5 text-xs font-medium text-bili-pink transition-colors hover:bg-bili-pink hover:text-white"
        >
          ✍️ 创作工作台
        </RouterLink>
        <RouterLink
          to="/admin/comments"
          class="rounded-lg bg-bili-blue/10 px-3 py-1.5 text-xs font-medium text-bili-blue transition-colors hover:bg-bili-blue hover:text-white"
        >
          💬 评论管理
        </RouterLink>
        <span>当前登录：{{ authStore.user?.email }}</span>
        <button
          type="button"
          class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-bili-text2 transition-colors hover:border-bili-pink hover:text-bili-pink"
          @click="handleSignOut"
        >
          退出登录
        </button>
      </div>
    </div>

    <div class="grid gap-5 lg:grid-cols-3">
      <!-- 概览与站点设置（含里程碑编辑） -->
      <section class="lg:col-span-3">
        <OverviewPanel :articles="articles" />
      </section>

      <!-- 文章列表 -->
      <section class="rounded-xl bg-white p-5 shadow-sm lg:col-span-2">
        <h2 class="mb-2 text-base font-semibold">文章列表（{{ articles.length }}）</h2>

        <div v-if="loading" class="py-16 text-center text-sm text-bili-text3">加载中…</div>

        <ul v-else class="divide-y divide-gray-100">
          <li
            v-for="article in articles"
            :key="article.id"
            class="flex items-center gap-4 py-3"
          >
            <img
              v-if="article.cover_url"
              :src="article.cover_url"
              :alt="article.title"
              loading="lazy"
              class="h-12 w-20 shrink-0 rounded-md bg-gray-100 object-cover"
            />
            <div
              v-else
              class="flex h-12 w-20 shrink-0 items-center justify-center rounded-md bg-bili-bg text-bili-text3"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="h-5 w-5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                />
              </svg>
            </div>

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm">{{ article.title }}</p>
              <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-bili-text3">
                <span>{{ formatDate(article.created_at) }}</span>
                <span>{{ formatCount(article.views) }} 播放</span>
                <span
                  v-if="article.is_auto_fetched"
                  class="rounded bg-blue-50 px-1.5 py-0.5 text-bili-blue"
                >
                  自动抓取
                </span>
                <span v-if="article.source_name">来源：{{ article.source_name }}</span>
                <span v-if="article.audio_url" class="text-green-600">有语音</span>
              </p>
            </div>

            <span
              class="shrink-0 rounded px-1.5 py-0.5 text-xs"
              :class="article.published ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'"
            >
              {{ article.published ? '已发布' : '草稿' }}
            </span>

            <button
              type="button"
              :disabled="generatingId === article.id"
              class="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-bili-text2 transition-colors hover:border-bili-blue hover:text-bili-blue disabled:opacity-50"
              @click="handleGenerateTts(article)"
            >
              {{ generatingId === article.id ? '生成中…' : '生成语音' }}
            </button>

            <button
              type="button"
              :disabled="busyId === article.id"
              class="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-bili-text2 transition-colors hover:border-bili-blue hover:text-bili-blue disabled:opacity-50"
              @click="handleTogglePublished(article)"
            >
              {{ article.published ? '下架' : '发布' }}
            </button>

            <button
              type="button"
              :disabled="busyId === article.id"
              class="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-bili-text2 transition-colors hover:border-bili-pink hover:text-bili-pink disabled:opacity-50"
              @click="handleDelete(article)"
            >
              删除
            </button>
          </li>
        </ul>
      </section>

      <!-- 新增文章表单 -->
      <section class="h-fit rounded-xl bg-white p-5 shadow-sm">
        <h2 class="mb-4 text-base font-semibold">新增文章</h2>
        <form class="space-y-4" @submit.prevent="handleCreate">
          <div>
            <label for="new-title" class="mb-1.5 block text-sm text-bili-text2">标题</label>
            <input
              id="new-title"
              v-model="newArticle.title"
              type="text"
              placeholder="请输入文章标题"
              class="h-10 w-full rounded-lg border border-gray-200 bg-bili-bg px-3 text-sm transition-colors outline-none placeholder:text-bili-text3 focus:border-bili-blue focus:bg-white"
            />
          </div>

          <div>
            <label for="new-content" class="mb-1.5 block text-sm text-bili-text2">正文</label>
            <textarea
              id="new-content"
              v-model="newArticle.content"
              rows="8"
              placeholder="请输入文章正文…"
              class="w-full resize-none rounded-lg border border-gray-200 bg-bili-bg px-3 py-2 text-sm transition-colors outline-none placeholder:text-bili-text3 focus:border-bili-blue focus:bg-white"
            ></textarea>
          </div>

          <button
            type="submit"
            :disabled="busyId === 'create'"
            class="h-10 w-full rounded-lg bg-bili-pink text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {{ busyId === 'create' ? '提交中…' : '提交' }}
          </button>

          <p v-if="tip" class="text-center text-xs" :class="tipIsError ? 'text-bili-pink' : 'text-green-600'">
            {{ tip }}
          </p>
        </form>
      </section>
    </div>
  </div>
</template>
