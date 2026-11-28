import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

// 路由 meta 类型增强：放在模块文件内做模块增强（全局 d.ts 的 ambient 写法会遮蔽 vue-router 的类型导出）
declare module 'vue-router' {
  interface RouteMeta {
    /** 需要登录才能访问（路由守卫依据） */
    requiresAuth?: boolean
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/Home.vue'),
    meta: { title: '首页' }
  },
  {
    path: '/article/:id',
    name: 'article-detail',
    component: () => import('@/views/ArticleDetail.vue'),
    meta: { title: '文章详情' }
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/AboutView.vue'),
    meta: { title: '关于' }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录' }
  },
  {
    path: '/admin',
    name: 'admin-dashboard',
    component: () => import('@/views/admin/Dashboard.vue'),
    meta: { title: '管理后台', requiresAuth: true }
  },
  {
    path: '/admin/writing',
    name: 'admin-writing',
    component: () => import('@/views/admin/WritingStudio.vue'),
    meta: { title: '创作工作台', requiresAuth: true }
  },
  {
    path: '/admin/comments',
    name: 'admin-comments',
    component: () => import('@/views/admin/CommentsView.vue'),
    meta: { title: '评论管理', requiresAuth: true }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFound.vue'),
    meta: { title: '页面不存在' }
  }
]

// hash 模式：Cloudflare Pages 纯静态托管，无需重定向规则
const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

/**
 * 全局登录守卫
 * 注意：main.ts 在 mount 前已 await authStore.initialize()，
 * 守卫执行时登录态必然已恢复完成；下面的 loading 判断只是防御性兜底
 */
router.beforeEach((to) => {
  const authStore = useAuthStore()

  // 初始化未完成时不拦截（正常流程不会走到这里）
  if (authStore.loading) return

  // 需要登录的页面：未登录 -> /login，并带上回跳地址
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // 已登录用户访问登录页 -> 直接进后台
  if (to.name === 'login' && authStore.isAuthenticated) {
    return { name: 'admin-dashboard' }
  }
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · VaizBot` : 'VaizBot · 我的个人小站'
})

export default router
