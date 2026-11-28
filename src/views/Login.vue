<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

/** 登录表单 */
const form = reactive({
  email: '',
  password: ''
})

const errorMessage = ref('')
const submitting = ref(false)

/**
 * 提交登录：supabase.auth.signInWithPassword
 * 成功后跳转：优先回跳守卫带来的 redirect 参数，否则进 /admin
 */
async function handleSubmit(): Promise<void> {
  errorMessage.value = ''
  submitting.value = true
  try {
    const error = await authStore.signIn(form.email, form.password)
    if (error) {
      errorMessage.value = error
      return
    }
    const redirect =
      typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
        ? route.query.redirect
        : '/admin'
    void router.push(redirect)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-md px-4 py-16">
    <div class="rounded-xl bg-white p-8 shadow-sm">
      <h1 class="text-center text-xl font-bold">登录 VaizBot</h1>
      <p class="mt-1.5 text-center text-xs text-bili-text3">仅管理员可登录（公开注册已在 Supabase 后台关闭）</p>

      <form class="mt-8 space-y-5" @submit.prevent="handleSubmit">
        <div>
          <label for="email" class="mb-1.5 block text-sm text-bili-text2">邮箱</label>
          <input
            id="email"
            v-model="form.email"
            type="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
            class="h-11 w-full rounded-lg border border-gray-200 bg-bili-bg px-3 text-sm transition-colors outline-none placeholder:text-bili-text3 focus:border-bili-blue focus:bg-white"
          />
        </div>

        <div>
          <label for="password" class="mb-1.5 block text-sm text-bili-text2">密码</label>
          <input
            id="password"
            v-model="form.password"
            type="password"
            required
            minlength="6"
            autocomplete="current-password"
            placeholder="请输入密码"
            class="h-11 w-full rounded-lg border border-gray-200 bg-bili-bg px-3 text-sm transition-colors outline-none placeholder:text-bili-text3 focus:border-bili-blue focus:bg-white"
          />
        </div>

        <button
          type="submit"
          :disabled="submitting"
          class="h-11 w-full rounded-lg bg-bili-pink text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ submitting ? '登录中…' : '登录' }}
        </button>
      </form>

      <p v-if="errorMessage" class="mt-4 text-center text-xs text-bili-pink">{{ errorMessage }}</p>

      <p class="mt-6 text-center text-xs text-bili-text3">
        没有账号？本站未开放注册，如需账号请联系管理员开通
      </p>
    </div>
  </div>
</template>
