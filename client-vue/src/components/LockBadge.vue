<!--
  锁状态徽章：
  - editing：绿色"我正在编辑"
  - viewing：黄色"xxx 正在编辑"（明确显示冲突用户）
-->
<template>
  <span v-if="state.kind === 'editing'" :style="badgeStyle('#dcfce7', '#15803d')">
    🔒 我正在编辑（{{ myName }}）
  </span>
  <span
    v-else
    :style="badgeStyle('#fef3c7', '#92400e')"
    :title="`userId=${state.by.id}`"
  >
    🚫 {{ holderPrimary }}{{ holderSecondary }} 正在编辑
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type LockHolder = { id: string; username: string; nickname?: string | null }
type LockState = { kind: 'editing' } | { kind: 'viewing'; by: LockHolder }

const props = defineProps<{
  state: LockState
  myName?: string
}>()

const holderPrimary = computed(() => {
  const by = props.state.kind === 'viewing' ? props.state.by : null
  if (!by) return ''
  return by.nickname?.trim() || by.username || '其他用户'
})
const holderSecondary = computed(() => {
  const by = props.state.kind === 'viewing' ? props.state.by : null
  if (!by || !by.nickname?.trim()) return ''
  return ` @${by.username}`
})

function badgeStyle(bg: string, color: string) {
  return {
    background: bg,
    color,
    padding: '2px 10px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 500,
  }
}
</script>
