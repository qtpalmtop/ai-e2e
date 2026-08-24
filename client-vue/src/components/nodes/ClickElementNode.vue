<template>
  <NodeShell
    :type="'clickElement'"
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

const label = computed(() => (props.data.label as string) ?? NODE_LABELS.clickElement)
const summary = computed(() => (props.data.selector as string) ?? '')
</script>
