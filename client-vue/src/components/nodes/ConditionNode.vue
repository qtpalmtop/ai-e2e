<!--
  条件节点：需要 2 个 sourceHandle（true / false）
  与 React 版一致：使用独立实现而不复用 NodeShell
-->
<template>
  <div
    :style="{
      background: '#fff',
      border: `2px solid ${selected ? '#111' : color}`,
      borderRadius: '10px',
      padding: '10px 14px',
      minWidth: '180px',
      position: 'relative',
    }"
  >
    <Handle
      type="target"
      :position="POS_LEFT"
      :style="{ background: color, width: '10px', height: '10px', zIndex: 5 }"
    />
    <div :style="{ fontSize: '11px', color, fontWeight: 600 }">条件判断</div>
    <div :style="{ fontSize: '14px', fontWeight: 600, marginTop: '2px' }">
      {{ label }}
    </div>
    <div
      :title="(data.expression as string) ?? ''"
      :style="{
        fontSize: '11px',
        color: '#64748b',
        marginTop: '4px',
        maxWidth: '200px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }"
    >
      {{ ((data.expression as string) ?? '').slice(0, 28) }}
    </div>
    <div
      v-if="hasError"
      title="存在校验错误"
      :style="{
        position: 'absolute',
        top: '-6px',
        right: '-6px',
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        background: '#ef4444',
        border: '2px solid #fff',
      }"
    />
    <Handle
      id="true"
      type="source"
      :position="POS_RIGHT"
      :style="{
        background: '#10b981',
        top: '30%',
        width: '10px',
        height: '10px',
        zIndex: 5,
      }"
    />
    <Handle
      id="false"
      type="source"
      :position="POS_RIGHT"
      :style="{
        background: '#ef4444',
        top: '70%',
        width: '10px',
        height: '10px',
        zIndex: 5,
      }"
    />
    <div
      :style="{
        position: 'absolute',
        right: '-32px',
        top: '24%',
        fontSize: '10px',
        color: '#10b981',
      }"
    >
      T
    </div>
    <div
      :style="{
        position: 'absolute',
        right: '-32px',
        top: '64%',
        fontSize: '10px',
        color: '#ef4444',
      }"
    >
      F
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { NODE_COLORS } from '@/config/nodeSchemas'

const props = defineProps<{
  id: string
  type: string
  data: Record<string, unknown>
  selected?: boolean
  hasError?: boolean
}>()

const color = NODE_COLORS.condition
const label = computed(() => (props.data.label as string) ?? '条件')
// 显式绑定到 setup scope，让 vue-tsc 与模板都能识别 Position 枚举
const POS_LEFT = Position.Left
const POS_RIGHT = Position.Right
</script>
