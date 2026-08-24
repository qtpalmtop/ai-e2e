<!--
  节点通用外壳：Handle + Card + 标题 + 摘要
  每个节点类型都基于它派生
-->
<template>
  <div
    :style="{
      background: '#fff',
      border: `2px solid ${selected ? '#111' : color}`,
      borderRadius: '10px',
      padding: '10px 14px',
      minWidth: '160px',
      boxShadow: selected ? '0 0 0 2px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.06)',
      position: 'relative',
    }"
  >
    <Handle
      v-if="props.target"
      type="target"
      :position="POS_LEFT"
      :style="{ background: color, width: '10px', height: '10px', zIndex: 5 }"
    />
    <div :style="{ fontSize: '11px', color, fontWeight: 600, letterSpacing: '0.5px' }">
      {{ NODE_LABELS[type].toUpperCase() }}
    </div>
    <div :style="{ fontSize: '14px', fontWeight: 600, color: '#111', marginTop: '2px' }">
      {{ label }}
    </div>
    <div
      v-if="summary"
      :title="summary"
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
      {{ summary }}
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
      v-if="props.source"
      id="out"
      type="source"
      :position="POS_RIGHT"
      :style="{ background: color, width: '10px', height: '10px', zIndex: 5 }"
    />
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { NODE_LABELS, NODE_COLORS } from '@/config/nodeSchemas'
import type { NodeType } from '@/types/schema'

// 用 withDefaults 给 source/target 默认 true，避免派生节点不传时
// v-if 走 falsy 分支不渲染 Handle
const props = withDefaults(defineProps<{
  type: NodeType
  label: string
  selected?: boolean
  source?: boolean
  target?: boolean
  summary?: string
  hasError?: boolean
}>(), {
  source: true,
  target: true,
})

const color = NODE_COLORS[props.type]
const POS_LEFT = Position.Left
const POS_RIGHT = Position.Right
</script>
