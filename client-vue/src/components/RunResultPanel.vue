<!--
  运行结果面板：底部抽屉样式，显示 PASS / FAIL + 耗时 + 日志
-->
<template>
  <div class="panel">
    <div class="header">
      <span :class="['status', result.ok ? 'pass' : 'fail']">
        {{ result.ok ? 'PASS' : 'FAIL' }}
      </span>
      <span class="dur">耗时 {{ result.duration }} ms</span>
      <div class="spacer" />
      <button class="close" aria-label="关闭" @click="emit('close')">×</button>
    </div>
    <pre class="logs">{{ result.logs }}</pre>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  result: { ok: boolean; logs: string; duration: number }
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<style scoped>
.panel {
  position: absolute;
  bottom: 16px;
  left: 16px;
  right: 16px;
  max-height: 240px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  z-index: 30;
  font-family: monospace;
  font-size: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-family: system-ui;
}
.status {
  padding: 2px 8px;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
}
.pass {
  background: #16a34a;
}
.fail {
  background: #dc2626;
}
.dur {
  color: #94a3b8;
}
.spacer {
  flex: 1;
}
.close {
  background: transparent;
  color: #94a3b8;
  border: none;
  cursor: pointer;
  font-size: 16px;
}
.logs {
  flex: 1;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
}
</style>
