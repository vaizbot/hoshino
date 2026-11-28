import type { Config } from 'tailwindcss'

export default {
  // 明暗双主题：.dark 类切换（src/lib/theme.ts 控制）
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      // B 站配色
      colors: {
        'bili-pink': '#FB7299',
        'bili-blue': '#00AEEC',
        'bili-bg': '#F1F2F3',
        'bili-text1': '#18191C',
        'bili-text2': '#61666D',
        'bili-text3': '#9499A0',
        // 语义色令牌：由 styles/index.css 的 CSS 变量驱动，支持明暗双态
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-2': 'rgb(var(--c-ink-2) / <alpha-value>)',
        'ink-3': 'rgb(var(--c-ink-3) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)'
      }
    }
  },
  plugins: []
} satisfies Config
