<script setup lang="ts">
/** 分类胶囊：横向滑动，点击切换分类（「全部」清除过滤） */
defineProps<{
  categories: Array<{ value: string; label: string }>
  active: string
}>()

const emit = defineEmits<{
  select: [value: string]
}>()
</script>

<template>
  <div class="mx-auto mt-4 flex max-w-[1240px] gap-2 overflow-x-auto px-4 md:px-8 lg:px-10">
    <button
      type="button"
      class="shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-colors"
      :class="
        active === ''
          ? 'border-bili-pink bg-bili-pink text-white'
          : 'border-line bg-surface/80 text-ink-2 backdrop-blur hover:border-bili-pink hover:text-bili-pink'
      "
      @click="emit('select', '')"
    >
      全部
    </button>
    <button
      v-for="c in categories"
      :key="c.value"
      type="button"
      class="shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-colors"
      :class="
        active === c.value
          ? 'border-bili-pink bg-bili-pink text-white'
          : 'border-line bg-surface/80 text-ink-2 backdrop-blur hover:border-bili-pink hover:text-bili-pink'
      "
      @click="emit('select', c.value)"
    >
      {{ c.label }}
    </button>
  </div>
</template>
