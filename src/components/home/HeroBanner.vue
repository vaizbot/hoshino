<script setup lang="ts">
import { ref } from 'vue'

import { siteAvatar, siteName, siteSignature } from '@/lib/site'

/** 深色 Hero：品牌区（数据来自站点设置）+ 光斑鼠标视差 */
const wrap = ref<HTMLElement | null>(null)

function onMove(e: MouseEvent): void {
  const el = wrap.value
  if (!el) return
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return
  el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3))
  el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3))
}

function onLeave(): void {
  const el = wrap.value
  if (!el) return
  el.style.setProperty('--px', '0')
  el.style.setProperty('--py', '0')
}

function layerStyle(factor: number): Record<string, string> {
  return {
    transform: `translate3d(calc(var(--px, 0) * ${factor}px), calc(var(--py, 0) * ${factor}px), 0)`
  }
}
</script>

<template>
  <section
    ref="wrap"
    class="relative h-40 select-none overflow-hidden bg-[#0a1020] md:h-64"
    @mousemove="onMove"
    @mouseleave="onLeave"
  >
    <!-- 装饰光斑（随鼠标视差） -->
    <div
      aria-hidden="true"
      class="absolute -top-20 left-[12%] h-72 w-72 rounded-full bg-bili-pink/30 blur-3xl"
      :style="layerStyle(40)"
    ></div>
    <div
      aria-hidden="true"
      class="absolute top-8 right-[15%] h-64 w-64 rounded-full bg-bili-blue/25 blur-3xl"
      :style="layerStyle(70)"
    ></div>
    <div
      aria-hidden="true"
      class="absolute -bottom-24 left-[55%] h-72 w-72 rounded-full bg-indigo-400/20 blur-3xl"
      :style="layerStyle(50)"
    ></div>

    <!-- 品牌区 -->
    <div class="relative mx-auto flex h-full max-w-[1240px] items-center gap-4 px-4 md:gap-6">
      <RouterLink
        to="/about"
        class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-bili-pink to-bili-blue text-2xl font-bold text-white shadow-2xl ring-4 ring-white/20 md:h-24 md:w-24 md:text-4xl"
        title="关于我"
      >
        <img v-if="siteAvatar" :src="siteAvatar" alt="" class="h-full w-full object-cover" />
        <span v-else>V</span>
      </RouterLink>
      <div class="min-w-0">
        <h1 class="text-2xl font-bold text-white md:text-3xl">{{ siteName }}</h1>
        <p class="mt-1 truncate text-sm text-white/75 md:text-base">{{ siteSignature }}</p>
      </div>
    </div>
  </section>
</template>
