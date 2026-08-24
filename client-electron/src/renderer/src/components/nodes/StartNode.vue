<!--
  节点集合 — 与 React 版对应：
  1. start / end：无 source / target handle
  2. openPage / inputText / clickElement / hoverElement / wait：标准单入单出
  3. condition：双 source（true / false）
  4. loop：标准单入单出
-->
<template>
  <NodeShell
    :type="'start'"
    :label="label"
    :source="true"
    :target="false"
    :summary="summary"
    :selected="selected"
    :has-error="hasError"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import NodeShell from './NodeShell.vue'

const props = defineProps<{
  id: string
  type: string
  data: Record<string, unknown>
  selected?: boolean
  hasError?: boolean
}>()

const label = computed(() => (props.data.label as string) ?? '开始')
const summary = computed(() => '')
</script>
