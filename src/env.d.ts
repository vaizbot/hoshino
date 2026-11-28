/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase 项目 URL（.env.local 中配置） */
  readonly VITE_SUPABASE_URL: string
  /** Supabase anon key（.env.local 中配置） */
  readonly VITE_SUPABASE_ANON_KEY: string
  /** TTS Workers 地址（.env.local 中配置，本地开发为 http://localhost:8787） */
  readonly VITE_TTS_WORKER_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<{}, {}, any>
  export default component
}
