<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { articlesService } from '@/services/articles'
import { activeMilestones, siteAvatar, siteName, siteSignature } from '@/lib/site'
import { TECH_STACK } from '@/data/techStack'
import CommentSection from '@/components/common/CommentSection.vue'

/** 关于页：头卡 + 自我介绍 + 技术栈 + 站点历程 + 社交（数据来自 site_settings，可后台编辑） */

const articleCount = ref(0)

onMounted(async () => {
  const list = await articlesService.getAllPublished()
  articleCount.value = list.length
})

/** 里程碑 V 标签 */
function verTag(text: string): string {
  const m = /V\d+(?:\.\d+)*/i.exec(text)
  return m ? m[0] : ''
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6 pb-24">
    <!-- 头部卡 -->
    <div class="glass-card flex flex-col items-center p-6">
      <img
        v-if="siteAvatar"
        :src="siteAvatar"
        :alt="siteName"
        class="h-20 w-20 rounded-full object-cover"
      />
      <div
        v-else
        class="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-bili-pink to-bili-blue text-3xl font-bold text-white"
      >
        V
      </div>
      <h1 class="mt-3 text-xl font-bold text-ink">{{ siteName }}</h1>
      <p class="mt-1 text-sm text-ink-2">{{ siteSignature }}</p>
      <div class="mt-4 flex flex-wrap justify-center gap-2">
        <span class="rounded-full bg-bili-pink/10 px-2.5 py-0.5 text-xs text-bili-pink">{{ articleCount }} 篇文章</span>
        <span class="rounded-full bg-bili-blue/10 px-2.5 py-0.5 text-xs text-bili-blue">五种声线朗读</span>
        <span class="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">AI 翻译</span>
      </div>
    </div>

    <!-- 自我介绍 -->
    <section class="glass-card mt-4 p-4 md:p-5">
      <div class="mb-3 flex items-center gap-2">
        <span class="h-5 w-1 rounded-full bg-bili-pink"></span>
        <h2 class="text-lg font-bold text-ink">自我介绍</h2>
      </div>
      <p class="mb-3 text-[15px] leading-8 text-justify text-ink">
        你好，欢迎来到 {{ siteName }}。这里是我的个人小站：记录日常、分享技术、收集故事。
        站内每篇文章都支持用「我的声音」朗读——普通话、吴侬软语、英语、日语、韩语五种声线任意切换，
        通勤路上也能听完一篇。
      </p>
      <p class="text-[15px] leading-8 text-justify text-ink">
        写作时我会借助 AI 辅助整理结构与打磨语句，但每一个字最终都经过自己确认。
        站点还很年轻，欢迎常来看看，也欢迎给我留言。
      </p>
    </section>

    <!-- 技术栈 -->
    <section class="glass-card mt-4 p-4 md:p-5">
      <div class="mb-3 flex items-center gap-2">
        <span class="h-5 w-1 rounded-full bg-bili-blue"></span>
        <h2 class="text-lg font-bold text-ink">技术栈</h2>
        <span class="text-xs text-ink-3">由这些技术搭建</span>
      </div>
      <div class="w-full md:w-[74%]">
        <div v-for="s in TECH_STACK" :key="s.name" class="mb-3 flex items-center gap-3">
          <div class="flex w-32 shrink-0 items-center gap-1.5">
            <span class="h-2 w-2 rounded-full" :style="{ background: s.color }"></span>
            <span class="truncate text-sm text-ink-2">{{ s.name }}</span>
          </div>
          <div class="h-2 flex-1 rounded-full bg-surface-2">
            <div class="h-full rounded-full" :style="{ width: s.percent + '%', background: s.color }"></div>
          </div>
          <span class="w-9 shrink-0 text-right text-xs tabular-nums text-ink-3">{{ s.percent }}%</span>
        </div>
      </div>
    </section>

    <!-- 站点历程 -->
    <section class="glass-card mt-4 p-4 md:p-5">
      <div class="mb-3 flex items-center gap-2">
        <span class="h-5 w-1 rounded-full bg-amber-400"></span>
        <h2 class="text-lg font-bold text-ink">站点历程</h2>
      </div>
      <div class="border-l-2 border-line pl-5">
        <div v-for="(m, i) in activeMilestones()" :key="i" class="relative pb-4 last:pb-0">
          <span class="absolute top-1 -left-[26px] flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-bili-pink bg-surface">
            <span class="h-1.5 w-1.5 rounded-full bg-bili-pink"></span>
          </span>
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-md bg-bili-pink px-2 py-0.5 text-[11px] font-semibold text-white">{{ m.year }}</span>
            <span v-if="verTag(m.text)" class="rounded-full bg-bili-pink/10 px-2 py-0.5 text-[11px] font-semibold text-bili-pink">
              {{ verTag(m.text) }}
            </span>
          </div>
          <p class="mt-1 text-sm leading-6 text-ink-2">{{ m.text }}</p>
        </div>
      </div>
      <p v-if="!activeMilestones().length" class="text-xs text-ink-3">暂无里程碑。</p>
    </section>

    <!-- 留言板 -->
    <section class="glass-card mt-4 p-4 md:p-5">
      <div class="mb-3 flex items-center gap-2">
        <span class="h-5 w-1 rounded-full bg-bili-pink"></span>
        <h2 class="text-lg font-bold text-ink">留言板</h2>
      </div>
      <CommentSection post-id="guestbook" />
    </section>

    <!-- 社交 -->
    <div class="mt-6 flex justify-center gap-1">
      <a
        class="a-icon-btn"
        href="https://github.com/vaizbot"
        target="_blank"
        rel="noopener noreferrer"
        title="GitHub"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 015.78 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12v3.14c0 .3.21.67.8.55A11.51 11.51 0 0023.5 12C23.5 5.65 18.35.5 12 .5z" />
        </svg>
      </a>
      <a
        class="a-icon-btn"
        href="https://space.bilibili.com/27744648"
        target="_blank"
        rel="noopener noreferrer"
        title="哔哩哔哩"
      >
        <span class="text-sm">📺</span>
      </a>
    </div>
  </div>
</template>
