// 认证 store
// token 走 httpOnly cookie（浏览器自动管理），这里只缓存 "是否登录 / 用户概要"
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { auth, type Me } from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const me = ref<Me | null>(null)
  const loaded = ref(false) // 是否已经尝试加载过（区分"未登录"和"还没查"）

  async function load() {
    try {
      me.value = await auth.me()
    } catch {
      me.value = null
    } finally {
      loaded.value = true
    }
  }

  async function login(username: string, password: string) {
    await auth.login(username, password)
    me.value = await auth.me()
    loaded.value = true
  }

  async function register(username: string, password: string, nickname?: string) {
    await auth.register(username, password, nickname)
    me.value = await auth.me()
    loaded.value = true
  }

  async function logout() {
    try {
      await auth.logout()
    } catch {
      /* ignore */
    }
    me.value = null
  }

  return { me, loaded, load, login, register, logout }
})
