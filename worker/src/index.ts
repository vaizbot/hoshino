import type { ExecutionContext, ExportedHandler, ScheduledController } from '@cloudflare/workers-types'

import { parseRss } from './rss'
import type { RssItem } from './rss'
import { RSS_SOURCES } from './sources'
import type { RssSource } from './sources'
import {
  findBySourceUrl,
  findOldestDraft,
  insertDraft,
  markDraftRejected,
  publishArticle
} from './supabase'
import { handleTtsRequest } from './tts'
import type { TtsEnv } from './tts'
import { handleTranslateRequest } from './translate'
import type { TranslateEnv } from './translate'

/** 任务 A 的 cron（UTC 16:00 = 北京时间次日 0:00）：自动发布一篇草稿 */
const CRON_PUBLISH = '0 16 * * *'
/** 任务 B 的 cron（UTC 16:30 = 北京时间次日 0:30）：预抓一篇新文章 */
const CRON_FETCH = '30 16 * * *'

/** 正文最短字符数：预抓与发布前都会校验 */
const MIN_CONTENT_LENGTH = 800
/** 发布任务单次最多尝试的草稿条数（防止异常数据导致死循环） */
const MAX_PUBLISH_ATTEMPTS = 25

export type Env = TtsEnv & TranslateEnv

export default {
  /** 定时任务入口：按 cron 表达式分发到两个任务 */
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      if (controller.cron === CRON_PUBLISH) {
        await publishOneDraft(env)
      } else if (controller.cron === CRON_FETCH) {
        await prefetchOneArticle(env)
      } else {
        console.log(`[scheduled] 未知 cron：${controller.cron}，本次忽略`)
      }
    } catch (error) {
      // 业务分支（空池 / 无新内容）不报错；这里兜底记录意外异常，避免 Cron 被标记失败重试风暴
      console.error('[scheduled] 任务执行异常：', error instanceof Error ? error.message : String(error))
    }
  },

  /** HTTP 入口：/tts 语音链路 + 健康检查 */
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // TTS 语音链路（含 CORS 与 OPTIONS 预检处理）
    if (url.pathname === '/tts') {
      return handleTtsRequest(request, env)
    }

    // 翻译链路：Supabase 目标语言字段有值直接返回；否则 Workers AI 翻译并写回
    if (url.pathname === '/translate') {
      return handleTranslateRequest(request, env)
    }

    // 健康检查（wrangler dev --test-scheduled 会拦截 /__scheduled 并触发 scheduled()）
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('VaizBot worker is running', { status: 200 })
    }

    return new Response('Not Found', { status: 404 })
  }
} satisfies ExportedHandler<Env>

/** 任务 A：发布一篇最早的自动抓取草稿 */
async function publishOneDraft(env: Env): Promise<void> {
  for (let attempt = 0; attempt < MAX_PUBLISH_ATTEMPTS; attempt++) {
    const draft = await findOldestDraft(env)
    if (!draft) {
      console.log('[publish] 草稿池为空，今日没有可发布的文章')
      return
    }

    const titleOk = draft.title.trim() !== ''
    const contentOk = draft.content.length >= MIN_CONTENT_LENGTH
    if (titleOk && contentOk) {
      await publishArticle(env, draft.id)
      console.log(`[publish] 已发布草稿：《${draft.title}》（id=${draft.id}）`)
      return
    }

    // 校验未通过：标记 is_auto_fetched=false，避免每次都被选中，然后继续尝试下一条
    await markDraftRejected(env, draft.id)
    console.log(
      `[publish] 草稿「${draft.title || '(空标题)'}」校验未通过（标题为空或正文不足 ${MIN_CONTENT_LENGTH} 字符），已剔除并尝试下一条`
    )
  }
  console.log(`[publish] 连续剔除 ${MAX_PUBLISH_ATTEMPTS} 条后仍未找到可发布草稿，今日跳过发布`)
}

/** 任务 B：从 RSS 源预抓一篇新文章入库（草稿） */
async function prefetchOneArticle(env: Env): Promise<void> {
  for (const source of RSS_SOURCES) {
    try {
      const items = await fetchRssItems(source)
      for (const item of items) {
        if (item.content.length < MIN_CONTENT_LENGTH) {
          console.log(
            `[fetch] 跳过《${item.title}》：正文 ${item.content.length} 字符，不足 ${MIN_CONTENT_LENGTH}`
          )
          continue
        }

        // 查重：同一链接不入库两次
        if (await findBySourceUrl(env, item.link)) continue

        await insertDraft(env, {
          title: item.title,
          content: item.content,
          source_url: item.link,
          source_name: source.name,
          published: false,
          is_auto_fetched: true,
          // 有原始发布时间就沿用（草稿队列按 created_at 升序发布），否则数据库默认 now()
          ...(item.pubDate ? { created_at: item.pubDate } : {})
        })
        console.log(`[fetch] 新文章已入库（草稿）：《${item.title}》来自 ${source.name}`)
        return
      }
      console.log(`[fetch] ${source.name}：没有可入库的新内容（均已入库或正文都过短）`)
    } catch (error) {
      console.warn(
        `[fetch] 源 ${source.name}（${source.url}）处理失败：${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  console.log('[fetch] 所有源均无新内容或全部失败，今日不入库')
}

/** 拉取并解析单个 RSS 源 */
async function fetchRssItems(source: RssSource): Promise<RssItem[]> {
  const response = await fetch(source.url, {
    headers: {
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      'User-Agent': 'VaizBotFetcher/0.1'
    }
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const xml = await response.text()
  return parseRss(xml)
}
