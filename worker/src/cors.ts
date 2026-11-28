/**
 * CORS 公共工具：/tts 与 /translate 两个路由共用
 * 允许来源列表在 wrangler.toml 的 [vars] ALLOWED_ORIGIN 配置（逗号分隔）
 */

export interface CorsEnv {
  /** 允许跨域的前端域名，逗号分隔（本地开发地址 + Pages 域名） */
  ALLOWED_ORIGIN: string
}

/** 校验来源并生成 CORS 头；来源不被允许时返回 null */
export function corsHeaders(request: Request, env: CorsEnv): Record<string, string> | null {
  const origin = request.headers.get('Origin')
  if (!origin) return {} // 非浏览器请求（curl / 同源调用）无需 CORS 头
  const allowed = env.ALLOWED_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!allowed.includes(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'X-Audio-Url, X-TTS-Warning',
    Vary: 'Origin'
  }
}

/** OPTIONS 预检响应 */
export function preflightResponse(request: Request, env: CorsEnv): Response {
  const cors = corsHeaders(request, env)
  if (!cors) {
    return new Response('CORS：当前来源不被允许', { status: 403 })
  }
  return new Response(null, { status: 204, headers: cors })
}
