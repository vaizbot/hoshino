<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { deleteComment, fetchAllComments } from '@/services/comments'
import type { CommentItem } from '@/services/comments'

/** 评论管理：全部评论倒序 + 删除 */

const comments = ref<CommentItem[]>([])
const loading = ref(false)

async function refresh(): Promise<void> {
  loading.value = true
  try {
    comments.value = await fetchAllComments()
  } finally {
    loading.value = false
  }
}

onMounted(() => void refresh())

async function remove(c: CommentItem): Promise<void> {
  if (!window.confirm(`删除「${c.name || '匿名'}」的这条评论？`)) return
  await deleteComment(c.id)
  void refresh()
}
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-5">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-lg font-bold text-ink">评论管理</h1>
      <span class="text-xs text-ink-3">{{ comments.length }} 条</span>
    </div>

    <div v-if="loading" class="py-16 text-center text-sm text-ink-3">加载中…</div>

    <div v-else-if="comments.length" class="space-y-2">
      <div v-for="c in comments" :key="c.id" class="glass-card flex items-start gap-3 p-3">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-2">
            <span class="text-xs font-medium text-ink">{{ c.name || '匿名' }}</span>
            <span class="rounded border border-line px-1 text-[10px] text-ink-3">
              {{ c.post_id === 'guestbook' ? '留言板' : '文章' }}
            </span>
            <span class="text-[10px] text-ink-3">{{ new Date(c.created_at).toLocaleString('zh-CN', { hour12: false }) }}</span>
          </div>
          <p class="mt-1 text-sm leading-6 break-words text-ink">{{ c.content }}</p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-full border border-red-300 px-3 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
          @click="remove(c)"
        >
          删除
        </button>
      </div>
    </div>

    <div v-else class="glass-card py-16 text-center">
      <p class="text-sm text-ink-3">还没有评论。</p>
    </div>
  </div>
</template>
