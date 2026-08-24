<template>
  <NodeShell
    :type="'inputText'"
    :label="label"
    :source="true"
    :target="true"
    :summary="summary"
    :selected="selected"
    :has-error="hasError"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import NodeShell from './NodeShell.vue'
import { NODE_LABELS } from '@/config/nodeSchemas'

const props = defineProps<{
  id: string
  type: string
  data: Record<string, unknown>
  selected?: boolean
  hasError?: boolean
}>()

const label = computed(() => (props.data.label as string) ?? NODE_LABELS.inputText)
const summary = computed(() => {
  const sel = (props.data.selector as string) ?? ''
  const t = ((props.data.text as string) ?? '').slice(0, 12)
  return `${sel} → "${t}…"`
})
</script>
