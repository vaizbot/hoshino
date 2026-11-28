<script setup lang="ts">
import ArticleCard from '@/components/ArticleCard.vue'
import type { Article } from '@/types/article'

/** 文章网格：移动端双列瀑布流，md+ 响应式网格 2/3/4 列 */
defineProps<{
  articles: Article[]
}>()
</script>

<template>
  <div class="columns-2 gap-4 md:columns-auto md:grid md:grid-cols-2 md:gap-5 lg:grid-cols-3 xl:grid-cols-4">
    <ArticleCard v-for="a in articles" :key="a.id" :article="a" />
  </div>
</template>
