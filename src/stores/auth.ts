import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Session, User } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  /** 当前登录用户 */
  const user = ref<User | null>(null)
  /** 当前会话（含 access_token / refresh_token） */
  const session = ref<Session | null>(null)
  /** 初始化中：true 表示尚未恢复本地会话，路由守卫据此等待，避免误判重定向 */
  const loading = ref(true)

  const isAuthenticated = computed(() => session.value !== null)

  /** 防止重复初始化 */
  let initialized = false

  /**
   * 恢复会话并监听登录态变化
   * main.ts 在 app.mount() 之前 await 本方法：
   * 页面首次渲染时登录态已就绪，路由守卫不会出现「先跳登录页、会话恢复后又跳回」的连续重定向
   */
  async function initialize(): Promise<void> {
    if (initialized) return
    initialized = true

    try {
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      user.value = data.session?.user ?? null
    } finally {
      loading.value = false
    }

    // 登录 / 登出 / token 自动刷新都会触发此回调，状态始终与服务端一致
    supabase.auth.onAuthStateChange((_event, newSession) => {
      session.value = newSession
      user.value = newSession?.user ?? null
    })
  }

  /**
   * 邮箱密码登录
   * @returns 失败时返回错误信息；成功返回 null（登录态由 onAuthStateChange 自动写入）
   */
  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  /** 退出登录 */
  async function signOut(): Promise<void> {
    await supabase.auth.signOut()
  }

  return { user, session, loading, isAuthenticated, initialize, signIn, signOut }
})
