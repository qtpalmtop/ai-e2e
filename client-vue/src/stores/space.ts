// 空间 store：当前选中的空间 + 列表
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { spaces as spacesApi, type Space } from '@/api'

const LS_KEY = 'e2e.currentSpaceId'

export const useSpaceStore = defineStore('space', () => {
  const list = ref<Space[]>([])
  const currentId = ref<string | null>(localStorage.getItem(LS_KEY))

  async function load() {
    list.value = await spacesApi.list()
    // 第一次进入：如果本地没记或当前空间不在列表里，自动选 common / 第一个
    const cur = currentId.value
    const valid = cur && list.value.find((s) => s.id === cur)
    if (!valid) {
      const fallback = list.value.find((s) => s.isDefault) ?? list.value[0] ?? null
      if (fallback) setCurrent(fallback.id)
    }
  }

  function setCurrent(id: string) {
    currentId.value = id
    localStorage.setItem(LS_KEY, id)
  }

  async function create(name: string, description?: string) {
    const s = await spacesApi.create(name, description)
    list.value = [...list.value, s]
    return s
  }

  return { list, currentId, load, setCurrent, create }
})
