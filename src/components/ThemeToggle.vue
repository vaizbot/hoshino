<script setup lang="ts">
import { isDark, toggleTheme } from '@/lib/theme'
</script>

<template>
  <button
    type="button"
    class="a-icon-btn"
    :title="isDark ? '切到日间模式' : '切到夜间模式'"
    aria-label="切换主题"
    @click="toggleTheme"
  >
    <span v-if="isDark" class="text-base">☀️</span>
    <span v-else class="text-base">🌙</span>
  </button>
</template>
