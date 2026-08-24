<!--
  Field 子组件（AtomInspector 内部用）
  - label 文本（可空） + 默认插槽
-->
<template>
  <div class="field">
    <div v-if="label" class="field-label">{{ label }}</div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label?: string
}>()
</script>

<style scoped>
.field {
  margin-bottom: 8px;
}
.field-label {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 2px;
}
</style>
