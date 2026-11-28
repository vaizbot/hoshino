/**
 * Supabase 写库封装（Worker 专用）
 *
 * - 使用 service_role key：服务端身份，绕过 RLS 直接读写全部数据
 *   （key 通过 wrangler secret put 注入，只存在于 Worker 环境，绝不进入前端）
 * - 直接用 PostgREST（REST API）+ fetch 调用，零运行时依赖，Worker 包体最小
 */

export interface DbEnv {
  /** Supabase 项目 URL，例如 https://xxx.supabase.co（非机密，wrangler.toml 的 [vars] 中配置） */
  SUPABASE_URL: string
  /** service_role key：仅通过 wrangler secret put 注入，禁止写进仓库 / 前端 */
  SUPABASE_SERVICE_ROLE_KEY: string
}

export interface ArticleRow {
  id: string
  title: string
  content: string
  cover_url: string | null
  audio_url: string | null
  content_zh: string | null
  content_en: string | null
  views: number
  published: boolean
  source_url: string | null
  source_name: string | null
  is_auto_fetched: boolean
  created_at: string
}

/** 预抓入库的字段（views / content_zh / content_en 等走数据库默认值） */
export interface DraftInsert {
  title: string
  content: string
  source_url: string
  source_name: string
  published: boolean
  is_auto_fetched: boolean
  /** 原文发布时间；不传则由数据库默认 now() */
  created_at?: string
}

function authHeaders(env: DbEnv): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    // 新版 Supabase 会拦截「浏览器特征」的请求使用 secret 密钥；
    // 明确声明非浏览器身份，避免被误判为浏览器调用
    'User-Agent': 'VaizBotWorker/1.0'
  }
}

async function request<T>(env: DbEnv, pathAndQuery: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`, init)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Supabase ${response.status}: ${body.slice(0, 300)}`)
  }
  // PATCH/DELETE 等操作可能返回 204 空响应体，直接返回 null，不能 JSON.parse
  const text = await response.text()
  if (!text) return null as T
  return JSON.parse(text) as T
}

/** 最早的自动抓取草稿（published=false 且 is_auto_fetched=true），没有则返回 null */
export async function findOldestDraft(env: DbEnv): Promise<ArticleRow | null> {
  const query =
    'articles?select=*&published=eq.false&is_auto_fetched=eq.true&order=created_at.asc&limit=1'
  const rows = await request<ArticleRow[]>(env, query, { method: 'GET', headers: authHeaders(env) })
  return rows[0] ?? null
}

/** 发布草稿（published=true） */
export async function publishArticle(env: DbEnv, id: string): Promise<void> {
  await request<unknown>(env, `articles?id=eq.${id}`, {
    method: 'PATCH',
    headers: authHeaders(env),
    body: JSON.stringify({ published: true })
  })
}

/** 校验未通过的草稿：标记 is_auto_fetched=false，避免被发布任务反复选中 */
export async function markDraftRejected(env: DbEnv, id: string): Promise<void> {
  await request<unknown>(env, `articles?id=eq.${id}`, {
    method: 'PATCH',
    headers: authHeaders(env),
    body: JSON.stringify({ is_auto_fetched: false })
  })
}

/** 按 source_url 查重：该链接是否已入库 */
export async function findBySourceUrl(env: DbEnv, sourceUrl: string): Promise<boolean> {
  const query = `articles?select=id&source_url=eq.${encodeURIComponent(sourceUrl)}&limit=1`
  const rows = await request<unknown[]>(env, query, { method: 'GET', headers: authHeaders(env) })
  return rows.length > 0
}

/** 插入预抓草稿，返回落库后的完整记录 */
export async function insertDraft(env: DbEnv, draft: DraftInsert): Promise<ArticleRow> {
  const rows = await request<ArticleRow[]>(env, 'articles', {
    method: 'POST',
    headers: { ...authHeaders(env), Prefer: 'return=representation' },
    body: JSON.stringify(draft)
  })
  const row = rows[0]
  if (!row) throw new Error('插入后未返回记录')
  return row
}

/** 把 R2 公共音频地址写回 articles.audio_url（TTS 链路第 4 步） */
export async function updateArticleAudioUrl(
  env: DbEnv,
  articleId: string,
  audioUrl: string
): Promise<void> {
  await request<unknown>(env, `articles?id=eq.${encodeURIComponent(articleId)}`, {
    method: 'PATCH',
    headers: authHeaders(env),
    body: JSON.stringify({ audio_url: audioUrl })
  })
}

/** 按 id 取一篇文章（service_role，绕过 RLS，含未发布草稿） */
export async function getArticleById(env: DbEnv, id: string): Promise<ArticleRow | null> {
  const query = `articles?select=*&id=eq.${encodeURIComponent(id)}&limit=1`
  const rows = await request<ArticleRow[]>(env, query, { method: 'GET', headers: authHeaders(env) })
  return rows[0] ?? null
}

/** 写回译文：field 只能是 content_zh / content_en（翻译链路第 6 步） */
export async function updateArticleTranslation(
  env: DbEnv,
  articleId: string,
  field: 'content_zh' | 'content_en',
  text: string
): Promise<void> {
  await request<unknown>(env, `articles?id=eq.${encodeURIComponent(articleId)}`, {
    method: 'PATCH',
    headers: authHeaders(env),
    body: JSON.stringify({ [field]: text })
  })
}

/** Supabase Storage 音频公共桶名（TTS 链路使用，公开可读、service_role 写入） */
export const AUDIO_BUCKET = 'audio'

/** 检查公共对象是否存在；存在返回其 Content-Type，不存在返回 null */
export async function storageObjectHead(env: DbEnv, path: string): Promise<string | null> {
  const url = `${env.SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${path}`
  const response = await fetch(url, { method: 'HEAD' })
  if (!response.ok) return null
  return response.headers.get('content-type')
}

/** 下载公共对象；不存在返回 null */
export async function downloadStorageObject(
  env: DbEnv,
  path: string
): Promise<ArrayBuffer | null> {
  const url = `${env.SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${path}`
  const response = await fetch(url)
  if (!response.ok) return null
  return response.arrayBuffer()
}

/** 上传对象到 Storage（service_role 写入；桶为 public，访客可读） */
export async function uploadStorageObject(
  env: DbEnv,
  path: string,
  bytes: ArrayBuffer,
  contentType: string
): Promise<void> {
  const url = `${env.SUPABASE_URL}/storage/v1/object/${AUDIO_BUCKET}/${path}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...authHeaders(env), 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Storage 上传失败 ${response.status}: ${body.slice(0, 200)}`)
  }
}
