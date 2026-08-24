<template>
  <NodeShell
    :type="'end'"
    :label="label"
    :source="false"
    :target="true"
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

const label = computed(() => (props.data.label as string) ?? '结束')
const summary = computed(() => '')
</script>
