// 路由守卫：未登录 → /login
// 已在 router/index.ts 通过 beforeEach 实现（比组件级 <ProtectedRoute> 更早期拦截）
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSpaceStore } from '@/stores/space'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    name: 'list',
    component: () => import('@/pages/ListPage.vue'),
    meta: { title: '用例列表' },
  },
  {
    path: '/case/:id',
    name: 'canvas',
    component: () => import('@/pages/CanvasPage.vue'),
    meta: { title: '画布' },
  },
  {
    path: '/forms',
    name: 'formDesigner',
    component: () => import('@/pages/FormDesignerPage.vue'),
    meta: { title: '表单设计器' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 全局守卫：先确保 auth 加载过，再决定是否放行
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.loaded) {
    await auth.load()
  }

  // 公开路由：已登录就跳走
  if (to.meta.public) {
    if (auth.me) return { path: '/', replace: true }
    return true
  }

  // 私有路由：未登录跳登录页
  if (!auth.me) {
    return { path: '/login', query: { redirect: to.fullPath }, replace: true }
  }

  // 私有路由：已登录则确保加载空间列表（用于导航栏空间选择器）
  const space = useSpaceStore()
  if (space.list.length === 0) {
    space.load().catch(() => {
      /* 静默失败，各页面按需重试 */
    })
  }

  return true
})

router.afterEach((to) => {
  const t = (to.meta?.title as string) || ''
  document.title = t ? `${t} · 流程引擎` : '流程引擎'
})

export default router
