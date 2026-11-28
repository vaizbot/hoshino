<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { addComment, fetchComments } from '@/services/comments'
import type { CommentItem } from '@/services/comments'

/**
 * 评论区（文章评论 / 留言板共用）：
 * - 匿名昵称 + 内容 + 隐藏蜜罐字段防机器人
 * - 服务端校验在 RLS 策略里兜底
 */

const props = defineProps<{
  postId: string
}>()

const comments = ref<CommentItem[]>([])
const loading = ref(false)
const sending = ref(false)
const tip = ref('')
const tipIsError = ref(false)

const formName = ref('')
const formContent = ref('')
const honeypot = ref('')

async function load(): Promise<void> {
  loading.value = true
  try {
    comments.value = await fetchComments(props.postId)
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())

function showTip(message: string, isError = false): void {
  tip.value = message
  tipIsError.value = isError
  window.setTimeout(() => {
    if (tip.value === message) tip.value = ''
  }, 3000)
}

async function submit(): Promise<void> {
  if (sending.value) return
  sending.value = true
  try {
    const result = await addComment({
      post_id: props.postId,
      name: formName.value,
      content: formContent.value,
      honeypot: honeypot.value
    })
    if (result.ok) {
      formContent.value = ''
      showTip('已发布，谢谢你的留言 💕')
      await load()
    } else {
      showTip(result.message ?? '发送失败', true)
    }
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div>
    <!-- 评论表单 -->
    <form class="glass-inner space-y-2.5 p-3" @submit.prevent="submit">
      <!-- 蜜罐：真人看不见（CSS 隐藏），机器人填了直接丢弃 -->
      <input v-model="honeypot" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" class="absolute -left-[9999px] h-px w-px opacity-0" />
      <input v-model="formName" type="text" maxlength="30" class="glass-input" placeholder="昵称（可选，默认匿名）" />
      <textarea
        v-model="formContent"
        rows="3"
        maxlength="1000"
        required
        class="w-full resize-none rounded-lg border border-transparent bg-white/50 px-3 py-2 text-sm leading-5 text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-bili-pink dark:bg-slate-800/70"
        placeholder="说点什么吧……"
      ></textarea>
      <div class="flex items-center justify-between">
        <span class="text-[11px] text-ink-3">{{ formContent.length }}/1000</span>
        <button
          type="submit"
          :disabled="sending"
          class="rounded-full bg-bili-pink px-5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {{ sending ? '发送中…' : '发布' }}
        </button>
      </div>
    </form>

    <p v-if="tip" class="mt-2 text-center text-xs" :class="tipIsError ? 'text-bili-pink' : 'text-emerald-600'">
      {{ tip }}
    </p>

    <!-- 评论列表 -->
    <div class="mt-4 space-y-3">
      <p v-if="loading" class="py-6 text-center text-xs text-ink-3">评论加载中…</p>
      <div v-for="c in comments" :key="c.id" class="glass-inner flex gap-3 p-3">
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-bili-pink to-bili-blue text-xs font-bold text-white"
        >
          {{ (c.name || '匿').slice(0, 1) }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <span class="text-xs font-medium text-ink">{{ c.name || '匿名' }}</span>
            <span class="text-[10px] text-ink-3">{{ new Date(c.created_at).toLocaleString('zh-CN', { hour12: false }) }}</span>
          </div>
          <p class="mt-1 text-sm leading-6 break-words text-ink">{{ c.content }}</p>
        </div>
      </div>
      <p v-if="!loading && !comments.length" class="py-6 text-center text-xs text-ink-3">
        还没有评论，来抢沙发～
      </p>
    </div>
  </div>
</template>
