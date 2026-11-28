<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { settingsService } from '@/services/settings'
import { activeMilestones, milestones, siteAvatar, siteName, siteSignature, visitorReading } from '@/lib/site'
import type { MilestoneItem } from '@/lib/site'
import { formatCount } from '@/utils/format'
import type { Article } from '@/types/article'

/** 后台概览：统计 + 站点设置 + 里程碑编辑（数据存 site_settings 单行表） */

const props = defineProps<{
  articles: Article[]
}>()

/* ---- 统计 ---- */
const stats = computed(() => {
  const list = props.articles
  return {
    total: list.length,
    published: list.filter((a) => a.published).length,
    drafts: list.filter((a) => !a.published).length,
    views: list.reduce((n, a) => n + a.views, 0),
    fetched: list.filter((a) => a.is_auto_fetched).length
  }
})

/* ---- 站点设置表单 ---- */
const formName = ref('')
const formSignature = ref('')
const formAvatar = ref('')
const savingBasic = ref(false)
const tip = ref('')
const tipIsError = ref(false)

onMounted(() => {
  formName.value = siteName.value
  formSignature.value = siteSignature.value
  formAvatar.value = siteAvatar.value
})

function showTip(message: string, isError = false): void {
  tip.value = message
  tipIsError.value = isError
}

async function saveBasic(): Promise<void> {
  savingBasic.value = true
  try {
    const err = await settingsService.saveBasic(formName.value, formAvatar.value, formSignature.value)
    showTip(err ?? '站点设置已保存', Boolean(err))
  } finally {
    savingBasic.value = false
  }
}

async function toggleVisitor(): Promise<void> {
  const err = await settingsService.saveVisitorReading(!visitorReading.value)
  showTip(err ?? '访客朗读设置已保存', Boolean(err))
}

/* ---- 里程碑编辑（软删除 + 回收站） ---- */
interface DraftItem extends MilestoneItem {
  uid: number
}

let uidSeq = 0
const draft = ref<DraftItem[]>([])
const editing = ref(false)
const showTrash = ref(false)
const msSaving = ref(false)

function startEdit(): void {
  draft.value = milestones.value.map((m) => ({ ...m, uid: ++uidSeq }))
  editing.value = true
  showTrash.value = false
}

function cancelEdit(): void {
  editing.value = false
  showTrash.value = false
}

function addRow(): void {
  draft.value.push({ uid: ++uidSeq, year: '', text: '' })
}

function removeRow(item: DraftItem): void {
  item.deletedAt = new Date().toISOString()
}

function restoreRow(item: DraftItem): void {
  item.deletedAt = undefined
}

function purgeRow(item: DraftItem): void {
  const i = draft.value.indexOf(item)
  if (i >= 0) draft.value.splice(i, 1)
}

const activeDraft = computed(() => draft.value.filter((m) => !m.deletedAt))
const trashList = computed(() => draft.value.filter((m) => m.deletedAt))

async function saveMilestones(): Promise<void> {
  msSaving.value = true
  try {
    const err = await settingsService.saveMilestones(
      draft.value.map(({ year, text, deletedAt }) => ({ year, text, ...(deletedAt ? { deletedAt } : {}) }))
    )
    showTip(err ?? '里程碑已保存', Boolean(err))
    if (!err) {
      editing.value = false
      showTrash.value = false
    }
  } finally {
    msSaving.value = false
  }
}

function verTag(text: string): string {
  const m = /V\d+(?:\.\d+)*/i.exec(text)
  return m ? m[0] : ''
}
</script>

<template>
  <div class="space-y-4">
    <!-- 统计 -->
    <section class="glass-card p-4">
      <h3 class="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span class="h-4 w-1 rounded-full bg-bili-pink"></span>概览
      </h3>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div class="glass-inner p-3 text-center">
          <p class="text-xl font-bold text-ink">{{ stats.total }}</p>
          <p class="mt-0.5 text-xs text-ink-3">全部文章</p>
        </div>
        <div class="glass-inner p-3 text-center">
          <p class="text-xl font-bold text-emerald-500">{{ stats.published }}</p>
          <p class="mt-0.5 text-xs text-ink-3">已发布</p>
        </div>
        <div class="glass-inner p-3 text-center">
          <p class="text-xl font-bold text-amber-500">{{ stats.drafts }}</p>
          <p class="mt-0.5 text-xs text-ink-3">草稿</p>
        </div>
        <div class="glass-inner p-3 text-center">
          <p class="text-xl font-bold text-bili-blue">{{ formatCount(stats.views) }}</p>
          <p class="mt-0.5 text-xs text-ink-3">总播放</p>
        </div>
        <div class="glass-inner p-3 text-center">
          <p class="text-xl font-bold text-bili-pink">{{ stats.fetched }}</p>
          <p class="mt-0.5 text-xs text-ink-3">自动抓取</p>
        </div>
      </div>
    </section>

    <!-- 站点设置 -->
    <section class="glass-card p-4">
      <h3 class="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span class="h-4 w-1 rounded-full bg-bili-blue"></span>站点设置
      </h3>
      <div class="space-y-3">
        <div>
          <label for="site-name" class="mb-1 block text-xs text-ink-2">站名</label>
          <input id="site-name" v-model="formName" type="text" class="glass-input" placeholder="VaizBot" />
        </div>
        <div>
          <label for="site-signature" class="mb-1 block text-xs text-ink-2">签名</label>
          <input id="site-signature" v-model="formSignature" type="text" class="glass-input" placeholder="一句话介绍" />
        </div>
        <div>
          <label for="site-avatar" class="mb-1 block text-xs text-ink-2">头像图片 URL（留空显示 V 字标）</label>
          <input id="site-avatar" v-model="formAvatar" type="text" class="glass-input" placeholder="https://…" />
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            class="rounded-full px-4 py-1.5 text-xs font-medium transition-colors"
            :class="visitorReading ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-2 text-ink-3'"
            @click="toggleVisitor"
          >
            访客朗读：{{ visitorReading ? '已开启' : '已关闭' }}
          </button>
          <button
            type="button"
            :disabled="savingBasic"
            class="rounded-full bg-bili-pink px-5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            @click="saveBasic"
          >
            {{ savingBasic ? '保存中…' : '保存设置' }}
          </button>
        </div>
      </div>
    </section>

    <!-- 里程碑 -->
    <section class="glass-card p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink">
          <span class="h-4 w-1 rounded-full bg-amber-400"></span>里程碑
          <span class="text-xs font-normal text-ink-3">{{ activeMilestones().length }} 条</span>
        </h3>
        <div v-if="!editing">
          <button type="button" class="a-icon-btn" title="编辑里程碑" @click="startEdit">
            <span class="text-sm">✏️</span>
          </button>
        </div>
        <div v-else class="flex items-center gap-1.5">
          <button type="button" class="a-icon-btn" :class="showTrash ? 'text-bili-pink' : ''" :title="`回收站（${trashList.length}）`" @click="showTrash = !showTrash">
            <span class="text-sm">🗑️</span>
          </button>
          <button type="button" class="a-icon-btn" title="添加一条" @click="addRow">
            <span class="text-sm">➕</span>
          </button>
          <button type="button" class="a-icon-btn" title="取消编辑" @click="cancelEdit">
            <span class="text-sm">✖️</span>
          </button>
          <button
            type="button"
            class="a-icon-btn !bg-bili-pink/10 !text-bili-pink"
            :disabled="msSaving"
            :title="msSaving ? '保存中…' : '保存'"
            @click="saveMilestones"
          >
            <span class="text-sm">✔️</span>
          </button>
        </div>
      </div>

      <!-- 展示态 -->
      <div v-if="!editing" class="mt-3 space-y-1.5">
        <div
          v-for="(m, i) in activeMilestones()"
          :key="i"
          class="glass-inner flex flex-wrap items-center gap-2 px-3 py-2"
        >
          <span class="shrink-0 rounded-md bg-bili-pink px-1.5 py-0.5 text-xs font-bold text-white">{{ m.year }}</span>
          <span v-if="verTag(m.text)" class="shrink-0 rounded-full bg-bili-pink/10 px-2 py-0.5 text-[11px] font-semibold text-bili-pink">
            {{ verTag(m.text) }}
          </span>
          <span class="min-w-0 flex-1 truncate text-sm text-ink">{{ m.text }}</span>
        </div>
        <p v-if="!activeMilestones().length" class="py-4 text-center text-xs text-ink-3">
          还没有里程碑，点右上角 ✏️ 添加。
        </p>
      </div>

      <!-- 编辑态 -->
      <div v-else class="mt-3 space-y-2">
        <div v-for="item in activeDraft" :key="item.uid" class="glass-inner flex flex-wrap items-center gap-2 p-2.5">
          <input v-model="item.year" class="glass-input !h-[30px] !w-24" placeholder="年份" />
          <input v-model="item.text" class="glass-input !h-[30px] min-w-0 flex-1" placeholder="里程碑内容（如 V4 新增创作后台）" />
          <button type="button" class="a-icon-btn" title="删除" @click="removeRow(item)">
            <span class="text-sm">🗑️</span>
          </button>
        </div>
        <p v-if="!activeDraft.length" class="py-6 text-center text-xs text-ink-3">还没有里程碑，点上方 ➕ 写第一条。</p>

        <!-- 回收站 -->
        <div v-if="showTrash" class="glass-inner space-y-2 p-3">
          <span class="text-sm font-semibold text-ink">回收站</span>
          <div v-for="item in trashList" :key="item.uid" class="flex flex-wrap items-center gap-2 rounded-lg bg-white/40 p-2 dark:bg-slate-800/50">
            <span class="w-16 shrink-0 truncate text-xs text-ink-2">{{ item.year }}</span>
            <span class="min-w-0 flex-1 truncate text-xs text-ink-2">{{ item.text }}</span>
            <button type="button" class="a-icon-btn" title="恢复" @click="restoreRow(item)">
              <span class="text-sm">♻️</span>
            </button>
            <button type="button" class="a-icon-btn" title="彻底删除" @click="purgeRow(item)">
              <span class="text-sm">❌</span>
            </button>
          </div>
          <p v-if="!trashList.length" class="text-xs text-ink-3">回收站为空</p>
        </div>
      </div>

      <p class="mt-2.5 text-xs text-ink-3">保存后关于页「站点历程」立即更新。</p>
    </section>

    <!-- 操作提示 -->
    <p v-if="tip" class="text-center text-xs" :class="tipIsError ? 'text-bili-pink' : 'text-emerald-600'">
      {{ tip }}
    </p>
  </div>
</template>
