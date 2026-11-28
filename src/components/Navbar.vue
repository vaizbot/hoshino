<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import ThemeToggle from '@/components/ThemeToggle.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const keyword = ref('')

/** 头像占位文字：取登录邮箱首字母大写，未登录显示「登」 */
const avatarText = computed(() => {
  const email = authStore.user?.email
  return email ? email.slice(0, 1).toUpperCase() : '登'
})

/** 搜索：把关键词带到首页（TODO: 接入 Supabase 全文搜索） */
function handleSearch(): void {
  const kw = keyword.value.trim()
  if (!kw) return
  // TODO: 接入真实搜索接口（全文检索或按标题 ilike 查询）
  void router.push({ path: '/', query: { q: kw } })
}
</script>

<template>
  <header class="glass fixed inset-x-0 top-0 z-50 h-16 shadow-sm">
    <div class="mx-auto flex h-full max-w-7xl items-center gap-4 px-4 lg:gap-8">
      <!-- 左侧粉色 Logo（文字） -->
      <RouterLink to="/" class="flex shrink-0 items-center gap-2">
        <span class="flex h-8 w-8 items-center justify-center rounded-md bg-bili-pink text-lg font-bold text-white">B</span>
        <span class="text-xl font-bold tracking-wide text-bili-pink">VaizBot</span>
      </RouterLink>

      <!-- 中间搜索框 -->
      <form class="flex min-w-0 flex-1 justify-center" @submit.prevent="handleSearch">
        <div
          class="flex h-9 w-full max-w-md items-center overflow-hidden rounded-lg border border-gray-200 bg-bili-bg transition-colors focus-within:border-bili-blue focus-within:bg-white"
        >
          <input
            v-model="keyword"
            type="text"
            placeholder="搜索文章"
            class="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-bili-text3"
          />
          <button
            type="submit"
            class="flex h-full w-14 shrink-0 items-center justify-center text-bili-text2 transition-colors hover:bg-gray-200 hover:text-bili-blue"
            aria-label="搜索"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="h-4 w-4"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
      </form>

      <!-- 右侧：关于 + 投稿按钮 + 主题切换 + 头像 -->
      <div class="flex shrink-0 items-center gap-3">
        <RouterLink
          to="/about"
          class="text-sm text-ink-2 transition-colors hover:text-bili-pink"
        >
          关于
        </RouterLink>

        <RouterLink
          to="/admin"
          class="flex h-9 items-center gap-1 rounded-lg bg-bili-pink px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="h-4 w-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          投稿
        </RouterLink>

        <ThemeToggle />

        <RouterLink
          :to="authStore.isAuthenticated ? '/admin' : '/login'"
          :title="authStore.user?.email ?? '登录'"
          aria-label="个人中心"
        >
          <div
            class="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-bili-blue to-bili-pink text-sm font-bold text-white"
          >
            {{ avatarText }}
          </div>
        </RouterLink>
      </div>
    </div>
  </header>
</template>
