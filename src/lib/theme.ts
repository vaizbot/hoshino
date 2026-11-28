import { ref } from 'vue'

const KEY = 'vaizbot-theme'

function initialDark(): boolean {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark') return true
    if (saved === 'light') return false
  } catch {
    /* localStorage 不可用时跟随系统 */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** 当前是否暗色模式（全局响应式状态） */
export const isDark = ref(initialDark())

function apply(): void {
  document.documentElement.classList.toggle('dark', isDark.value)
}

/** main.ts 挂载前调用，先应用主题避免闪烁 */
export function initTheme(): void {
  apply()
}

/** 手动切换明暗主题并持久化 */
export function toggleTheme(): void {
  isDark.value = !isDark.value
  try {
    localStorage.setItem(KEY, isDark.value ? 'dark' : 'light')
  } catch {
    /* 忽略存储失败 */
  }
  apply()
}
