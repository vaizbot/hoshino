<script setup lang="ts">
import { onMounted } from 'vue'

import Navbar from '@/components/Navbar.vue'
import MusicPlayer from '@/components/layout/MusicPlayer.vue'
import BackToTop from '@/components/layout/BackToTop.vue'
import { initMusic } from '@/lib/music'

onMounted(() => {
  // 初始化音乐播放器（拉取网易云歌单，失败自动回退内置音源）
  initMusic()
})
</script>

<template>
  <div class="min-h-screen text-ink">
    <!-- 固定在顶部的导航栏 -->
    <Navbar />

    <!-- pt-16：为固定顶栏（h-16）让出空间 -->
    <main class="pt-16">
      <RouterView />
    </main>

    <!-- 左下角音乐播放器悬浮球 -->
    <MusicPlayer />

    <!-- 回到顶部（手机左下 / PC 右下） -->
    <BackToTop />
  </div>
</template>
