<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import type { SettingCategory, SettingItem, WritingProject } from '@/services/writing'

/**
 * 人设库：人物 / 世界观 / 情节 / 其他
 * - 分类筛选 + 搜索 + 双击编辑 + 软删除回收站
 */

const props = defineProps<{
  project: WritingProject
}>()

const SETTING_CATS: SettingCategory[] = ['人物', '世界观', '情节', '其他']
const FILTER_CATS: (SettingCategory | '全部')[] = ['全部', ...SETTING_CATS]

const settingsTrash = ref(false)
const kw = ref('')
const cat = ref<SettingCategory | '全部'>('全部')
const tip = ref('')

const modalOpen = ref(false)
const form = reactive({ id: '', title: '', category: '人物' as SettingCategory, content: '' })

const trashItems = computed(() => props.project.settings.filter((s) => s.deletedAt))

const filtered = computed(() => {
  const q = kw.value.trim().toLowerCase()
  return props.project.settings.filter(
    (s) =>
      !s.deletedAt &&
      (cat.value === '全部' || s.category === cat.value) &&
      (!q || s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q))
  )
})

function showTip(msg: string): void {
  tip.value = msg
  window.setTimeout(() => {
    if (tip.value === msg) tip.value = ''
  }, 2000)
}

function openNew(): void {
  form.id = ''
  form.title = ''
  form.category = '人物'
  form.content = ''
  modalOpen.value = true
}

function openEdit(item: SettingItem): void {
  form.id = item.id
  form.title = item.title
  form.category = item.category
  form.content = item.content
  modalOpen.value = true
}

function save(): void {
  const title = form.title.trim()
  if (!title) {
    showTip('先给人设起个名字')
    return
  }
  if (form.id) {
    const item = props.project.settings.find((s) => s.id === form.id)
    if (item) {
      item.title = title
      item.category = form.category
      item.content = form.content
    }
  } else {
    props.project.settings.push({
      id: crypto.randomUUID(),
      title,
      category: form.category,
      content: form.content
    })
  }
  modalOpen.value = false
  showTip('人设已保存')
}

function removeFromModal(): void {
  const item = props.project.settings.find((s) => s.id === form.id)
  if (item) item.deletedAt = new Date().toISOString()
  modalOpen.value = false
  showTip('已移入人设回收站，可随时恢复')
}

function restoreItem(id: string): void {
  const item = props.project.settings.find((s) => s.id === id)
  if (item) delete item.deletedAt
}

function removeItem(id: string): void {
  const i = props.project.settings.findIndex((s) => s.id === id)
  if (i >= 0) props.project.settings.splice(i, 1)
}

function clearTrash(): void {
  if (!window.confirm('回收站内全部人设将被彻底删除，不可恢复。')) return
  const rest = props.project.settings.filter((s) => !s.deletedAt)
  props.project.settings.splice(0, props.project.settings.length, ...rest)
}
</script>

<template>
  <div class="glass-card flex flex-col overflow-hidden">
    <div class="flex items-center justify-between p-3 pb-0">
      <span class="text-sm font-semibold text-ink">人设库</span>
      <button type="button" class="a-icon-btn relative" title="人设回收站" @click="settingsTrash = !settingsTrash">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-4 w-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
        <span
          v-if="trashItems.length"
          class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bili-pink px-0.5 text-[10px] font-medium text-white"
        >
          {{ trashItems.length }}
        </span>
      </button>
    </div>

    <template v-if="!settingsTrash">
      <div class="p-3 pb-1">
        <input v-model="kw" type="text" class="glass-input !h-8" placeholder="搜索人设…" />
      </div>
      <div class="flex flex-wrap gap-1.5 px-3 pb-2">
        <button
          v-for="c in FILTER_CATS"
          :key="c"
          type="button"
          class="rounded-full px-2.5 py-0.5 text-xs transition-colors"
          :class="cat === c ? 'bg-bili-pink text-white' : 'bg-surface-2 text-ink-2 hover:bg-surface'"
          @click="cat = c"
        >
          {{ c }}
        </button>
      </div>
      <div class="thin-scroll max-h-52 space-y-1.5 overflow-y-auto px-3 pb-3">
        <button
          v-for="item in filtered"
          :key="item.id"
          type="button"
          class="w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
          title="双击编辑"
          @dblclick="openEdit(item)"
        >
          <span class="flex items-center gap-1.5">
            <span class="truncate text-sm font-medium text-ink">{{ item.title }}</span>
            <span class="shrink-0 rounded border border-line px-1 text-[10px] text-ink-3">{{ item.category }}</span>
          </span>
        </button>
        <p v-if="!filtered.length" class="py-4 text-center text-xs text-ink-3">
          还没有人设，点「＋ 新增人设」开始搭建你的世界
        </p>
        <button type="button" class="w-full rounded-lg bg-surface-2 py-1.5 text-xs text-ink-2 transition-colors hover:bg-bili-pink/10 hover:text-bili-pink" @click="openNew">
          ＋ 新增人设
        </button>
      </div>
    </template>

    <template v-else>
      <div class="flex items-center justify-between px-3 pt-2">
        <button
          type="button"
          class="rounded-full border border-red-300 px-3 py-1 text-xs text-red-500 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
          @click="clearTrash"
        >
          清空
        </button>
        <button type="button" class="a-icon-btn" title="返回" @click="settingsTrash = false">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-4 w-4">
            <path stroke-linecap="round" d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="thin-scroll max-h-56 space-y-1.5 overflow-y-auto px-3 pt-2 pb-3">
        <div
          v-for="item in trashItems"
          :key="item.id"
          class="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2"
        >
          <span class="truncate text-sm text-ink-2">{{ item.title }}</span>
          <span class="flex shrink-0 items-center">
            <button type="button" class="a-icon-btn !h-7 !w-7" title="恢复" @click="restoreItem(item.id)">
              <span class="text-xs">♻️</span>
            </button>
            <button type="button" class="a-icon-btn !h-7 !w-7" title="彻底删除" @click="removeItem(item.id)">
              <span class="text-xs">❌</span>
            </button>
          </span>
        </div>
        <p v-if="!trashItems.length" class="py-4 text-center text-xs text-ink-3">回收站是空的</p>
      </div>
    </template>

    <!-- 新增/编辑弹窗 -->
    <div v-if="modalOpen" class="fixed inset-0 z-[70] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/20" @click="modalOpen = false"></div>
      <div class="glass-card relative z-10 w-[320px] max-w-[calc(100vw-24px)] p-4">
        <p class="mb-3 text-sm font-semibold text-ink">{{ form.id ? '编辑人设' : '新增人设' }}</p>
        <div class="space-y-2.5">
          <input v-model="form.title" type="text" class="glass-input" placeholder="人设名称（如：主角·林小满）" />
          <select v-model="form.category" class="h-9 w-full rounded-lg border border-line bg-white/50 px-2.5 text-sm text-ink outline-none focus:border-bili-pink dark:bg-slate-800/70">
            <option v-for="c in SETTING_CATS" :key="c" :value="c">{{ c }}</option>
          </select>
          <textarea
            v-model="form.content"
            rows="4"
            class="w-full resize-none rounded-lg border border-transparent bg-white/50 px-3 py-2 text-sm leading-5 text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-bili-pink dark:bg-slate-800/70"
            placeholder="详细设定：外貌、性格、背景、口头禅……"
          ></textarea>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            v-if="form.id"
            type="button"
            class="rounded-full border border-red-300 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
            @click="removeFromModal"
          >
            移入回收站
          </button>
          <button v-else type="button" class="rounded-full bg-surface-2 py-1.5 text-xs text-ink-2 hover:bg-surface" @click="modalOpen = false">
            取消
          </button>
          <button type="button" class="rounded-full bg-bili-pink py-1.5 text-xs font-medium text-white hover:opacity-90" @click="save">
            保存
          </button>
        </div>
      </div>
    </div>

    <p v-if="tip" class="px-3 pb-2 text-center text-[11px] text-emerald-600">{{ tip }}</p>
  </div>
</template>
