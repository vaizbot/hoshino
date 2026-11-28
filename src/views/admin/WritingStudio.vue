<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { writingService } from '@/services/writing'
import type { ProjectStatus, WritingProject } from '@/services/writing'
import OutlineMap from '@/components/writing/OutlineMap.vue'
import SettingsPanel from '@/components/writing/SettingsPanel.vue'
import { formatCount } from '@/utils/format'

/**
 * 写作工作台：
 * - 项目列表（状态 chip / 字数 / 回收站软删除）
 * - 编辑器：标题 + 大纲 + 正文，900ms 防抖自动保存
 * - 状态流转：草稿 → 存稿 → 发布（发布写入 articles 并可反复更新同一篇）
 */

const projects = ref<WritingProject[]>([])
const loading = ref(false)
const trashMode = ref(false)
const active = ref<WritingProject | null>(null)
const tip = ref('')
const tipIsError = ref(false)

const activeProjects = computed(() => projects.value.filter((p) => !p.deleted_at))
const trashedProjects = computed(() => projects.value.filter((p) => p.deleted_at))

const STATUS_META: Record<ProjectStatus, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'bg-surface-2 text-ink-3' },
  saved: { label: '存稿', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  published: { label: '已发布', cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' }
}

function showTip(message: string, isError = false): void {
  tip.value = message
  tipIsError.value = isError
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    projects.value = await writingService.list()
  } finally {
    loading.value = false
  }
}

onMounted(() => void refresh())

async function createAndOpen(): Promise<void> {
  const p = await writingService.create()
  if (!p) {
    showTip('创建失败', true)
    return
  }
  active.value = p
  lastSig.value = signature(p)
  showTip('新作品已创建，开始写吧')
}

function openWorkspace(p: WritingProject): void {
  active.value = JSON.parse(JSON.stringify(p)) as WritingProject
  lastSig.value = signature(active.value)
}

function closeWorkspace(): void {
  active.value = null
  void refresh()
}

/* ---- 自动保存：900ms 防抖 + 签名比对 ---- */
let saveTimer = 0
const lastSig = ref('')

function signature(p: WritingProject): string {
  return JSON.stringify({ title: p.title, draft: p.draft, status: p.status, outline: p.outline, settings: p.settings })
}

async function autosave(): Promise<void> {
  const p = active.value
  if (!p) return
  if (signature(p) === lastSig.value) return
  const ok = await writingService.save(p)
  if (ok) lastSig.value = signature(p)
}

watch(
  () => {
    const p = active.value
    return p ? JSON.stringify({ title: p.title, draft: p.draft, status: p.status, outline: p.outline, settings: p.settings }) : ''
  },
  () => {
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => void autosave(), 900)
  }
)

onBeforeUnmount(() => {
  window.clearTimeout(saveTimer)
  void autosave()
})

/* ---- 自动保存：900ms 防抖 + 签名比对 ---- */
async function setStatus(status: ProjectStatus, label: string): Promise<void> {
  const p = active.value
  if (!p) return
  p.status = status
  const ok = await writingService.save(p)
  if (ok) {
    lastSig.value = signature(p)
    showTip(label)
  } else {
    showTip('保存失败', true)
  }
}

async function publish(): Promise<void> {
  const p = active.value
  if (!p) return
  if (!p.draft.trim()) {
    showTip('正文为空，先写点什么再发布', true)
    return
  }
  const articleId = await writingService.publish(p)
  if (articleId) {
    p.status = 'published'
    lastSig.value = signature(p)
    showTip('已发布到网站（再次发布会更新同一篇）')
  } else {
    showTip('发布失败', true)
  }
}

/* ---- 回收站 ---- */
async function moveToTrash(p: WritingProject): Promise<void> {
  await writingService.trash(p.id)
  void refresh()
}

async function restoreProject(p: WritingProject): Promise<void> {
  await writingService.restore(p.id)
  void refresh()
}

async function removeForever(p: WritingProject): Promise<void> {
  if (!window.confirm(`彻底删除《${p.title || '未命名作品'}》？不可恢复。`)) return
  await writingService.remove(p.id)
  void refresh()
}

/* ---- 统计 ---- */
const wordCount = computed(() => (active.value ? active.value.draft.length : 0))
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-5">
    <!-- 编辑器视图 -->
    <div v-if="active" class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="a-icon-btn" title="返回列表" @click="closeWorkspace">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-4 w-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 class="text-lg font-bold text-ink">创作</h1>
        <span class="rounded-full px-2 py-0.5 text-xs" :class="STATUS_META[active.status].cls">
          {{ STATUS_META[active.status].label }}
        </span>
        <span class="text-xs text-ink-3">{{ wordCount }} 字 · 自动保存</span>
        <div class="flex-1"></div>
        <button type="button" class="rounded-full border border-line px-4 py-1.5 text-xs text-ink-2 transition-colors hover:border-bili-pink hover:text-bili-pink" @click="setStatus('saved', '已存稿')">
          存稿
        </button>
        <button type="button" class="rounded-full bg-bili-pink px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90" @click="publish">
          发布
        </button>
      </div>

      <div class="glass-card p-4">
        <input v-model="active.title" type="text" class="glass-input !h-11 !text-lg font-semibold" placeholder="作品标题" />
      </div>

      <div class="grid gap-4 lg:grid-cols-5">
        <!-- 左：正文（写作主区域） -->
        <section class="glass-card p-4 lg:col-span-3">
          <h2 class="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <span class="h-4 w-1 rounded-full bg-bili-pink"></span>正文
          </h2>
          <textarea
            v-model="active.draft"
            rows="26"
            placeholder="开始写作……（自动保存）"
            class="w-full resize-y rounded-xl border border-transparent bg-white/50 px-3 py-2 text-[15px] leading-7 text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-bili-pink dark:bg-slate-800/70"
          ></textarea>
        </section>

        <!-- 右：上人设库 + 下大纲地图 -->
        <div class="space-y-4 lg:col-span-2">
          <SettingsPanel v-if="active" :project="active" />
          <OutlineMap v-if="active" :project="active" />
        </div>
      </div>

      <p v-if="tip" class="text-center text-xs" :class="tipIsError ? 'text-bili-pink' : 'text-emerald-600'">
        {{ tip }}
      </p>
    </div>

    <!-- 列表视图 -->
    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="text-lg font-bold text-ink">创作</h1>
        <div class="flex-1"></div>
        <button type="button" class="rounded-full border border-line px-4 py-1.5 text-xs text-ink-2 transition-colors hover:border-bili-pink hover:text-bili-pink" @click="trashMode = !trashMode">
          {{ trashMode ? '返回列表' : `回收站（${trashedProjects.length}）` }}
        </button>
        <button type="button" class="rounded-full bg-bili-pink px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90" @click="createAndOpen">
          ＋ 新建作品
        </button>
      </div>

      <div v-if="loading" class="py-16 text-center text-sm text-ink-3">加载中…</div>

      <div v-else-if="trashMode" class="glass-card p-4">
        <div class="space-y-2">
          <div v-for="p in trashedProjects" :key="p.id" class="glass-inner flex flex-wrap items-center gap-3 p-3">
            <span class="min-w-0 flex-1 truncate text-sm text-ink">{{ p.title || '未命名作品' }}</span>
            <span class="shrink-0 text-xs text-ink-3">{{ formatCount(p.draft.length) }} 字</span>
            <button type="button" class="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:border-emerald-400 hover:text-emerald-500" @click="restoreProject(p)">
              恢复
            </button>
            <button type="button" class="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:border-bili-pink hover:text-bili-pink" @click="removeForever(p)">
              彻底删除
            </button>
          </div>
          <p v-if="!trashedProjects.length" class="py-8 text-center text-xs text-ink-3">回收站为空</p>
        </div>
      </div>

      <div v-else-if="activeProjects.length" class="grid gap-3 md:grid-cols-2">
        <button
          v-for="p in activeProjects"
          :key="p.id"
          type="button"
          class="glass-card group p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(16,24,40,0.1)]"
          @click="openWorkspace(p)"
        >
          <div class="flex items-center gap-2">
            <h3 class="min-w-0 flex-1 truncate font-semibold text-ink group-hover:text-bili-pink">
              {{ p.title || '未命名作品' }}
            </h3>
            <span class="shrink-0 rounded-full px-2 py-0.5 text-xs" :class="STATUS_META[p.status].cls">
              {{ STATUS_META[p.status].label }}
            </span>
          </div>
          <p class="mt-2 line-clamp-2 text-xs leading-5 text-ink-3">
            {{ p.draft.trim().slice(0, 100) || '（空）' }}
          </p>
          <div class="mt-3 flex items-center justify-between">
            <span class="text-xs text-ink-3">{{ formatCount(p.draft.length) }} 字</span>
            <span class="text-xs text-ink-3" @click.stop="moveToTrash(p)">🗑️</span>
          </div>
        </button>
      </div>

      <div v-else class="glass-card py-16 text-center">
        <p class="text-sm text-ink-3">还没有作品，点右上角「＋ 新建作品」开始创作。</p>
      </div>
    </div>
  </div>
</template>
