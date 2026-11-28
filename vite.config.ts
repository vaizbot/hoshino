import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

// https://vite.dev/config/
export default defineConfig({
  // 相对路径：兼容 GitHub Pages 项目站（用户名.github.io/仓库名/），Cloudflare Pages 同样可用
  base: './',
  plugins: [vue()],

  resolve: {
    alias: {
      // '@' -> src 目录
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },

  server: {
    watch: {
      // 忽略编辑器/工具产生的临时目录，避免 Windows 下 EBUSY 崩溃 dev 服务器
      ignored: ['**/.*.tmpdir/**', '**/*.tmp']
    }
  },

  css: {
    postcss: {
      // Tailwind CSS 与 Autoprefixer 直接注册在 Vite 配置里，项目内不产生任何 .js 配置文件
      plugins: [tailwindcss(), autoprefixer()]
    }
  },

  build: {
    // Cloudflare Pages 构建产物目录（默认值，显式声明）
    outDir: 'dist'
  }
})
