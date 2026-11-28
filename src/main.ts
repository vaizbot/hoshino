import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/stores/auth'
import { initTheme } from '@/lib/theme'
import { loadSiteSettings } from '@/lib/site'
import '@/styles/index.css'

// 挂载前应用主题（跟随系统/上次选择），避免闪烁
initTheme()

async function bootstrap(): Promise<void> {
  const app = createApp(App)

  const pinia = createPinia()
  app.use(pinia)
  app.use(router)

  // 挂载前先恢复会话：等 auth 初始化完成后页面才开始渲染，
  // 路由守卫看到的登录态是最终态，不会出现「先重定向到 /login、会话恢复后又跳回」的抖动
  const authStore = useAuthStore(pinia)
  await authStore.initialize()

  app.mount('#app')

  // 挂载后拉取站点设置（站名/签名/里程碑等，失败静默回退默认值）
  void loadSiteSettings()
}

void bootstrap()
