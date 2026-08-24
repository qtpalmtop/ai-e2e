// 表单 schema store
// 拉一次缓存到内存，多个组件订阅
// 改造点：所有请求都自动带上"当前 spaceId"（从 useSpaceStore 读取）
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { formSchemas as formSchemasApi } from '@/api'
import type { FormSchema, FormSchemas } from '@/types/formSchema'
import { useSpaceStore } from './space'

const EMPTY: FormSchema = { atoms: [] }

export const useFormSchemaStore = defineStore('formSchema', () => {
  const bySpace = ref<Record<string, FormSchemas>>({})
  const fetched = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const activeSpaceId = ref<string | null>(null)

  function currentSpaceId(): string | null {
    return useSpaceStore().currentId
  }

  async function fetchAll() {
    const spaceId = currentSpaceId()
    if (!spaceId) return
    if (loading.value) return
    loading.value = true
    error.value = null
    activeSpaceId.value = spaceId
    try {
      const all = await formSchemasApi.list(spaceId)
      bySpace.value = { ...bySpace.value, [spaceId]: all }
      fetched.value = true
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function fetchAllFor(spaceId: string) {
    if (!spaceId) return
    loading.value = true
    error.value = null
    activeSpaceId.value = spaceId
    try {
      const all = await formSchemasApi.list(spaceId)
      bySpace.value = { ...bySpace.value, [spaceId]: all }
      fetched.value = activeSpaceId.value === spaceId || fetched.value
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function save(type: string, schema: FormSchema) {
    const spaceId = currentSpaceId()
    if (!spaceId) throw new Error('no current space')
    saving.value = true
    error.value = null
    activeSpaceId.value = spaceId
    try {
      const saved = await formSchemasApi.save(spaceId, type, schema)
      bySpace.value = {
        ...bySpace.value,
        [spaceId]: { ...(bySpace.value[spaceId] ?? {}), [type]: saved },
      }
    } catch (e) {
      error.value = (e as Error).message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function reset() {
    const spaceId = currentSpaceId()
    if (!spaceId) throw new Error('no current space')
    saving.value = true
    error.value = null
    activeSpaceId.value = spaceId
    try {
      const all = await formSchemasApi.reset(spaceId)
      bySpace.value = { ...bySpace.value, [spaceId]: all }
    } catch (e) {
      error.value = (e as Error).message
      throw e
    } finally {
      saving.value = false
    }
  }

  function getLocal(type: string): FormSchema {
    const spaceId = currentSpaceId()
    return spaceId ? bySpace.value[spaceId]?.[type] ?? EMPTY : EMPTY
  }

  function getLocalFor(spaceId: string, type: string): FormSchema {
    return bySpace.value[spaceId]?.[type] ?? EMPTY
  }

  return {
    bySpace,
    fetched,
    loading,
    saving,
    error,
    activeSpaceId,
    fetchAll,
    fetchAllFor,
    save,
    reset,
    getLocal,
    getLocalFor,
  }
})
