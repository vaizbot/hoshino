<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

/** 回到顶部：统一右下角，对齐朗读圈圈正上方并留 16px 空隙，滚动超过 420px 显示 */
const show = ref(false)

function onScroll(): void {
  show.value = window.scrollY > 420
}

function toTop(): void {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <Transition name="fade">
    <button
      v-show="show"
      type="button"
      class="a-icon-btn glass fixed right-[34px] bottom-[96px] z-[55] h-9 w-9 rounded-full border shadow-md"
      aria-label="回到顶部"
      @click="toTop"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="h-4 w-4"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5m0 0-7 7m7-7 7 7" />
      </svg>
    </button>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
