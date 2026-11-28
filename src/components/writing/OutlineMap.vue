<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'

import {
  appendChapterToDraft,
  childDirTaken,
  layoutOutline,
  newChapter
} from './outline'
import type { Branch, Chapter } from './outline'
import type { WritingProject } from '@/services/writing'

/**
 * 大纲地图（为写小说重写）：
 * - 分支叙事树：根在上，子节点按左/主/右 45° 展开
 * - 状态色：粉=已取用（写进正文）、蓝=已保存、灰=新
 * - 交互：拖拽平移 / 滚轮缩放 / 双击编辑 / 右键聚焦 / 回中心 / 锁定
 * - 配套：大纲搜索、章节回收站（软删除）
 */

const props = defineProps<{
  project: WritingProject
}>()

const lock = ref(false)
const chapterTrash = ref(false)
const searchKw = ref('')
const editingId = ref<string | null>(null)
const pan = reactive({ x: 0, y: 0 })
const zoom = ref(1)
const mapEl = ref<HTMLElement | null>(null)
const tip = ref('')

const chapters = computed(() => props.project.outline)
const layoutMap = computed(() => layoutOutline(chapters.value))

interface PlacedNode {
  ch: Chapter
  x: number
  y: number
}

const nodes = computed<PlacedNode[]>(() => {
  const map = layoutMap.value
  const list: PlacedNode[] = []
  for (const ch of chapters.value) {
    if (ch.deletedAt) continue
    const pos = map.get(ch.id)
    if (pos) list.push({ ch, x: pos.x, y: pos.y })
  }
  return list
})

interface Edge {
  x1: number
  y1: number
  x2: number
  y2: number
  used: boolean
  saved: boolean
}

const edges = computed<Edge[]>(() => {
  const map = layoutMap.value
  const list: Edge[] = []
  for (const ch of chapters.value) {
    if (ch.deletedAt || !ch.parentId) continue
    const from = map.get(ch.parentId)
    const to = map.get(ch.id)
    if (!from || !to) continue
    list.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, used: Boolean(ch.used), saved: Boolean(ch.saved) })
  }
  return list
})

const editingChapter = computed(() => chapters.value.find((c) => c.id === editingId.value && !c.deletedAt) ?? null)

const searchHits = computed(() => {
  const q = searchKw.value.trim()
  if (!q) return []
  const lower = q.toLowerCase()
  return chapters.value.filter(
    (c) => !c.deletedAt && (c.title.toLowerCase().includes(lower) || c.summary.toLowerCase().includes(lower))
  )
})
const searchOpen = computed(() => searchKw.value.trim().length > 0)
const trashChapters = computed(() => chapters.value.filter((c) => c.deletedAt))

function showTip(msg: string): void {
  tip.value = msg
  window.setTimeout(() => {
    if (tip.value === msg) tip.value = ''
  }, 2000)
}

function clampZoom(z: number): number {
  return Math.min(2, Math.max(0.5, z))
}

/* ---- 拖拽平移 / 滚轮缩放（以容器中心为锚）---- */
let dragging = false
let startX = 0
let startY = 0
let startPanX = 0
let startPanY = 0

function onPointerDown(e: PointerEvent): void {
  if (lock.value || chapterTrash.value || e.button !== 0) return
  const target = e.target as HTMLElement | null
  if (target?.closest('button')) return
  dragging = true
  startX = e.clientX
  startY = e.clientY
  startPanX = pan.x
  startPanY = pan.y
  mapEl.value?.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging) return
  pan.x = startPanX + (e.clientX - startX)
  pan.y = startPanY + (e.clientY - startY)
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging) return
  dragging = false
  if (mapEl.value?.hasPointerCapture(e.pointerId)) mapEl.value.releasePointerCapture(e.pointerId)
}

function onWheel(e: WheelEvent): void {
  if (lock.value || chapterTrash.value) return
  const el = mapEl.value
  if (!el) return
  const next = clampZoom(zoom.value * (e.deltaY < 0 ? 1.1 : 0.9))
  if (next === zoom.value) return
  const cx = (el.clientWidth / 2 - pan.x) / zoom.value
  const cy = (el.clientHeight / 2 - pan.y) / zoom.value
  zoom.value = next
  pan.x = el.clientWidth / 2 - cx * next
  pan.y = el.clientHeight / 2 - cy * next
}

function focusNode(id: string): void {
  const el = mapEl.value
  const pos = layoutMap.value.get(id)
  if (!el || !pos) return
  pan.x = el.clientWidth / 2 - pos.x * zoom.value
  pan.y = el.clientHeight / 2 - pos.y * zoom.value
}

function fitView(): void {
  const el = mapEl.value
  if (!el) return
  const list = nodes.value
  if (!list.length) {
    zoom.value = 1
    pan.x = 0
    pan.y = 0
    return
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of list) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x)
    maxY = Math.max(maxY, n.y)
  }
  const pad = 40
  const z = clampZoom(Math.min(el.clientWidth / (maxX - minX + pad * 2), el.clientHeight / (maxY - minY + pad * 2)))
  zoom.value = z
  pan.x = el.clientWidth / 2 - (minX + (maxX - minX) / 2) * z
  pan.y = el.clientHeight / 2 - (minY + (maxY - minY) / 2) * z
}

onMounted(() => {
  void nextTick(fitView)
})

/* ---- 节点操作 ---- */
function addRoot(): void {
  props.project.outline.push(newChapter(null, null))
  showTip('已创建故事起点，双击编辑')
  void nextTick(fitView)
}

function openEditor(id: string): void {
  editingId.value = id
}

function closeEditor(): void {
  editingId.value = null
}

function onGrow(dir: Branch): void {
  const parent = editingChapter.value
  if (!parent) return
  if (childDirTaken(chapters.value, parent.id, dir)) {
    showTip('这个方向已经有支线了')
    return
  }
  const child = newChapter(parent.id, dir)
  props.project.outline.push(child)
  openEditor(child.id)
  void nextTick(fitView)
}

function onSave(): void {
  const ch = editingChapter.value
  if (!ch) return
  ch.saved = true
  showTip('已定稿')
}

function onUse(): void {
  const ch = editingChapter.value
  if (!ch) return
  if (ch.used) {
    showTip('这个章节已经写入过正文了')
    return
  }
  ch.used = true
  props.project.draft = appendChapterToDraft(props.project.draft, ch)
  showTip('已写入正文：标题与摘要已追加到正文末尾')
}

function onRemove(): void {
  const ch = editingChapter.value
  if (!ch) return
  ch.deletedAt = new Date().toISOString()
  closeEditor()
  showTip('已移入章节回收站')
}

function restoreChapter(id: string): void {
  const ch = chapters.value.find((c) => c.id === id)
  if (ch) delete ch.deletedAt
}

function removeChapter(id: string): void {
  const i = chapters.value.findIndex((c) => c.id === id)
  if (i >= 0) chapters.value.splice(i, 1)
}

function clearTrash(): void {
  if (!window.confirm('回收站内全部章节将被彻底删除，不可恢复。')) return
  const rest = chapters.value.filter((c) => !c.deletedAt)
  props.project.outline.splice(0, props.project.outline.length, ...rest)
}

function pickSearchHit(id: string): void {
  searchKw.value = ''
  focusNode(id)
  openEditor(id)
}

function onContext(id: string): void {
  focusNode(id)
}

function lineColor(e: Edge): string {
  if (e.used) return '#FB7299'
  if (e.saved) return '#00AEEC'
  return '#C6D2E3'
}

function lineWidth(e: Edge): number {
  if (e.used) return 2.5
  if (e.saved) return 2
  return 1.5
}

function nodeClass(ch: Chapter): string {
  if (ch.used) return 'border-bili-pink bg-bili-pink/10 text-bili-pink'
  if (ch.saved) return 'border-bili-blue text-bili-blue'
  return 'border-line text-ink-2'
}
</script>

<template>
  <div class="glass-card flex flex-col overflow-hidden">
    <!-- 工具栏 -->
    <div class="relative flex items-center justify-between p-3 pb-0">
      <span class="text-sm font-semibold text-ink">大纲地图</span>
      <div class="flex items-center gap-0.5">
        <button type="button" class="a-icon-btn" title="添加根节点" @click="addRoot">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-4 w-4">
            <path stroke-linecap="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <div class="relative">
          <input v-model="searchKw" type="text" class="glass-input !h-7 !w-28 !text-xs" placeholder="搜索章节" />
          <div v-if="searchOpen" class="glass-card thin-scroll absolute right-0 top-full z-30 mt-1 max-h-48 w-56 overflow-y-auto p-1">
            <button
              v-for="hit in searchHits"
              :key="hit.id"
              type="button"
              class="w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
              @click="pickSearchHit(hit.id)"
            >
              <span class="block truncate text-sm text-ink">{{ hit.title || '未命名章节' }}</span>
              <span v-if="hit.summary" class="block truncate text-xs text-ink-3">{{ hit.summary.slice(0, 20) }}</span>
            </button>
            <p v-if="!searchHits.length" class="px-2 py-3 text-center text-xs text-ink-3">没有匹配的章节</p>
          </div>
        </div>
        <button type="button" class="a-icon-btn relative" title="章节回收站" @click="chapterTrash = !chapterTrash">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-4 w-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
          <span
            v-if="trashChapters.length"
            class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bili-pink px-0.5 text-[10px] font-medium text-white"
          >
            {{ trashChapters.length }}
          </span>
        </button>
        <button type="button" class="a-icon-btn" :class="lock ? 'text-bili-pink' : ''" :title="lock ? '解锁地图' : '锁定地图'" @click="lock = !lock">
          <svg v-if="lock" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-4 w-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-4 w-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
          </svg>
        </button>
        <button type="button" class="a-icon-btn" title="回中心" @click="fitView">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-4 w-4">
            <circle cx="12" cy="12" r="3" />
            <path stroke-linecap="round" d="M12 2v3m0 14v3M2 12h3m14 0h3" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 地图画布 -->
    <div
      ref="mapEl"
      class="relative aspect-[5/8] touch-none overflow-hidden rounded-b-2xl bg-surface-2/60"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @contextmenu.prevent
    >
      <template v-if="!chapterTrash">
        <svg
          class="pointer-events-none absolute top-0 left-0 overflow-visible"
          :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }"
        >
          <line
            v-for="(e, i) in edges"
            :key="i"
            :x1="e.x1"
            :y1="e.y1"
            :x2="e.x2"
            :y2="e.y2"
            :stroke="lineColor(e)"
            :stroke-width="lineWidth(e)"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <div
          class="absolute top-0 left-0"
          :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }"
        >
          <button
            v-for="n in nodes"
            :key="n.ch.id"
            type="button"
            class="absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-white text-[12px] font-medium shadow-sm dark:bg-surface"
            :class="nodeClass(n.ch)"
            :style="{ left: `${n.x}px`, top: `${n.y}px` }"
            :title="n.ch.title || '未命名章节'"
            @dblclick="openEditor(n.ch.id)"
            @contextmenu.prevent="onContext(n.ch.id)"
          >
            {{ n.ch.title.slice(0, 2) || '章' }}
          </button>
        </div>
        <p
          v-if="!nodes.length"
          class="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-ink-3"
        >
          还没有章节，点右上角 ＋ 创建故事起点
        </p>
        <!-- 图例 -->
        <div class="absolute bottom-2 left-2 flex items-center gap-2 rounded bg-surface/80 px-2 py-1 text-[10px] text-ink-3 backdrop-blur">
          <span class="flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full bg-bili-pink"></span>已写入正文</span>
          <span class="flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full bg-bili-blue"></span>已定稿</span>
          <span class="flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full bg-[#C6D2E3]"></span>新章节</span>
        </div>
        <p class="absolute right-2 bottom-2 rounded bg-surface/80 px-2 py-1 text-[10px] text-ink-3 backdrop-blur">双击节点编辑 · 右键聚焦</p>
      </template>

      <!-- 章节回收站 -->
      <template v-else>
        <div class="thin-scroll absolute inset-0 overflow-y-auto p-3">
          <div class="flex items-center justify-between pb-2">
            <button
              type="button"
              class="rounded-full border border-red-300 px-3 py-1 text-xs text-red-500 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
              @click="clearTrash"
            >
              清空
            </button>
            <button type="button" class="a-icon-btn" title="返回" @click="chapterTrash = false">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-4 w-4">
                <path stroke-linecap="round" d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="space-y-1.5">
            <div
              v-for="ch in trashChapters"
              :key="ch.id"
              class="flex items-center justify-between gap-2 rounded-lg bg-surface px-2 py-1.5"
            >
              <span class="truncate text-sm text-ink-2">{{ ch.title || '未命名章节' }}</span>
              <span class="flex shrink-0 items-center">
                <button type="button" class="a-icon-btn" title="恢复" @click="restoreChapter(ch.id)">
                  <span class="text-sm">♻️</span>
                </button>
                <button type="button" class="a-icon-btn" title="彻底删除" @click="removeChapter(ch.id)">
                  <span class="text-sm">❌</span>
                </button>
              </span>
            </div>
            <p v-if="!trashChapters.length" class="py-4 text-center text-xs text-ink-3">章节回收站是空的</p>
          </div>
        </div>
      </template>
    </div>

    <!-- 章节编辑器 -->
    <div v-if="editingChapter" class="glass-inner m-3 space-y-2 p-3">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold text-ink">章节编辑</span>
        <button type="button" class="a-icon-btn !h-6 !w-6" title="关闭" @click="closeEditor">
          <span class="text-xs">✖️</span>
        </button>
      </div>
      <input v-model="editingChapter.title" type="text" class="glass-input" placeholder="章节标题" />
      <textarea
        v-model="editingChapter.summary"
        rows="3"
        class="w-full resize-none rounded-lg border border-transparent bg-white/50 px-3 py-2 text-xs leading-5 text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-bili-pink dark:bg-slate-800/70"
        placeholder="章节摘要（写入正文时一并追加）"
      ></textarea>
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="mr-1 text-[10px] text-ink-3">分支：</span>
        <button
          type="button"
          class="rounded-full border border-line px-2.5 py-1 text-[11px] transition-colors"
          :class="childDirTaken(chapters, editingChapter.id, 'left') ? 'cursor-not-allowed opacity-40' : 'text-ink-2 hover:border-bili-pink hover:text-bili-pink'"
          title="在左侧新增一条支线"
          @click="onGrow('left')"
        >
          ＋ 左支线
        </button>
        <button
          type="button"
          class="rounded-full border border-line px-2.5 py-1 text-[11px] transition-colors"
          :class="childDirTaken(chapters, editingChapter.id, 'main') ? 'cursor-not-allowed opacity-40' : 'text-ink-2 hover:border-bili-pink hover:text-bili-pink'"
          title="续写主线"
          @click="onGrow('main')"
        >
          ＋ 主线
        </button>
        <button
          type="button"
          class="rounded-full border border-line px-2.5 py-1 text-[11px] transition-colors"
          :class="childDirTaken(chapters, editingChapter.id, 'right') ? 'cursor-not-allowed opacity-40' : 'text-ink-2 hover:border-bili-pink hover:text-bili-pink'"
          title="在右侧新增一条支线"
          @click="onGrow('right')"
        >
          ＋ 右支线
        </button>
        <div class="flex-1"></div>
        <button type="button" class="rounded-full border border-bili-blue px-3 py-1 text-[11px] text-bili-blue hover:bg-bili-blue/5" @click="onSave">
          定稿
        </button>
        <button type="button" class="rounded-full bg-bili-pink px-3 py-1 text-[11px] font-medium text-white hover:opacity-90" @click="onUse">
          写入正文
        </button>
        <button type="button" class="rounded-full border border-red-300 px-3 py-1 text-[11px] text-red-500 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10" @click="onRemove">
          删除
        </button>
      </div>
    </div>

    <p v-if="tip" class="px-3 pb-2 text-center text-[11px] text-emerald-600">{{ tip }}</p>
  </div>
</template>
