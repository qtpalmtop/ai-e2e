<!--
  实时预览组件：连上 WebSocket 接收 step-start / step-end / log / done / error 事件
  - 组件挂载就连 WS，卸载自动断
  - alive 标志避免 unmount race
  - 日志自动滚到底
-->
<template>
  <div class="preview">
    <!-- header -->
    <div class="header">
      <span :class="['badge', badgeClass]">{{ statusLabel }}</span>
      <span class="title">Live 预览</span>
      <span v-if="duration != null" class="dur">{{ duration }} ms</span>
      <div class="spacer" />
      <button
        class="btn-primary"
        :disabled="status === 'running'"
        @click="handleStart"
      >
        {{ status === 'running' ? '运行中…' : '开始预览' }}
      </button>
      <button class="close" aria-label="关闭" @click="emit('close')">×</button>
    </div>

    <!-- 截图区 -->
    <div class="screenshot">
      <img
        v-if="screenshot"
        :src="`data:image/jpeg;base64,${screenshot}`"
        alt="browser screenshot"
      />
      <span v-else class="placeholder">
        {{ status === 'running' ? '等待第一帧截图…' : '尚未开始运行' }}
      </span>
    </div>

    <!-- 步骤区 -->
    <div class="steps">
      <div v-if="steps.length === 0" class="empty">暂无步骤</div>
      <div
        v-for="s in steps"
        :key="s.index"
        :class="['step', s.status === 'fail' ? 'step-fail' : '']"
      >
        <span :class="['mark', markClass(s.status)]">{{ markText(s.status) }}</span>
        <span class="num">{{ s.index + 1 }}.</span>
        <span class="name">{{ s.name }}</span>
        <span v-if="s.duration != null" class="step-dur">{{ s.duration }}ms</span>
      </div>
      <div v-if="error" class="err-line">{{ error }}</div>
    </div>

    <!-- 日志区 -->
    <div ref="logBoxRef" class="logs">
      <div v-for="(line, i) in logs" :key="i" class="log-line">{{ line }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { openLiveSocket, type LiveEvent } from '@/api'

const props = defineProps<{
  caseId: string
  onTrigger: () => Promise<unknown>
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

type StepStatus = 'running' | 'ok' | 'fail'
type StepRow = {
  index: number
  name: string
  status: StepStatus
  duration?: number
  error?: string
}

const status = ref<'idle' | 'running' | 'pass' | 'fail'>('idle')
const steps = ref<StepRow[]>([])
const logs = ref<string[]>([])
const screenshot = ref<string | null>(null)
const error = ref<string | null>(null)
const duration = ref<number | null>(null)

const statusLabel = computed(() => {
  if (status.value === 'idle') return 'READY'
  return status.value.toUpperCase()
})

const badgeClass = computed(() => `badge-${status.value}`)

function markClass(s: StepStatus) {
  if (s === 'ok') return 'mark-ok'
  if (s === 'fail') return 'mark-fail'
  return 'mark-running'
}
function markText(s: StepStatus) {
  if (s === 'ok') return '✓'
  if (s === 'fail') return '✗'
  return '⋯'
}

function handleEvent(ev: LiveEvent) {
  switch (ev.type) {
    case 'hello':
      break
    case 'start':
      status.value = 'running'
      steps.value = []
      logs.value = [`▶ start: ${ev.caseName}`]
      screenshot.value = null
      error.value = null
      duration.value = null
      break
    case 'step-start': {
      const name = ev.name + (ev.loop ? ` × ${ev.loop.count}` : '')
      steps.value = [
        ...steps.value,
        { index: ev.index, name, status: 'running' },
      ]
      logs.value = [...logs.value, `… ${ev.index + 1}. ${ev.name} (running)`]
      break
    }
    case 'step-end': {
      steps.value = steps.value.map((s) =>
        s.index === ev.index
          ? {
              ...s,
              status: ev.ok ? 'ok' : 'fail',
              duration: ev.duration,
              error: ev.error,
            }
          : s,
      )
      logs.value = [
        ...logs.value,
        `${ev.ok ? '✓' : '✗'} ${ev.index + 1}. ${ev.name} (${ev.duration}ms)${
          ev.error ? ' — ' + ev.error : ''
        }`,
      ]
      if (ev.screenshot) screenshot.value = ev.screenshot
      break
    }
    case 'log':
      logs.value = [...logs.value, ev.text]
      break
    case 'done':
      status.value = ev.ok ? 'pass' : 'fail'
      duration.value = ev.duration
      logs.value = [
        ...logs.value,
        `${ev.ok ? '✓ pass' : '✗ fail'} (total ${ev.duration}ms)`,
      ]
      break
    case 'error':
      status.value = 'fail'
      error.value = ev.message
      logs.value = [...logs.value, `✗ error: ${ev.message}`]
      break
  }
}

// 建立 WS
let ws: WebSocket | null = null
let alive = true
onMounted(() => {
  openLiveSocket(
    props.caseId,
    handleEvent,
    () => alive && (error.value = 'WebSocket 连接失败'),
  )
    .then((w) => {
      if (!alive) {
        try {
          w.close()
        } catch {
          /* ignore */
        }
        return
      }
      ws = w
      w.onclose = () => {
        if (ws === w) ws = null
      }
    })
    .catch(() => {
      if (alive) error.value = 'WebSocket 连接失败'
    })
})
onBeforeUnmount(() => {
  alive = false
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
})

// 日志自动滚到底
const logBoxRef = ref<HTMLElement | null>(null)
watch(
  () => logs.value.length,
  async () => {
    await nextTick()
    const el = logBoxRef.value
    if (el) el.scrollTop = el.scrollHeight
  },
)

async function handleStart() {
  if (status.value === 'running') return
  try {
    await props.onTrigger()
  } catch (e: any) {
    status.value = 'fail'
    error.value = e?.message ?? '启动失败'
  }
}
</script>

<style scoped>
.preview {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 420px;
  max-height: calc(100vh - 32px);
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.35);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 40;
  font-size: 12px;
}
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #1e293b;
}
.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: #475569;
  color: #fff;
}
.badge-running {
  background: #f59e0b;
}
.badge-pass {
  background: #16a34a;
}
.badge-fail {
  background: #dc2626;
}
.title {
  font-weight: 600;
}
.dur {
  color: #94a3b8;
  font-size: 11px;
}
.spacer {
  flex: 1;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}
.btn-primary:disabled {
  background: #475569;
  cursor: not-allowed;
}
.close {
  background: transparent;
  color: #94a3b8;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 0;
  line-height: 1;
}
.screenshot {
  height: 220px;
  background: #020617;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #1e293b;
  position: relative;
}
.screenshot img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.placeholder {
  color: #475569;
  font-size: 12px;
}
.steps {
  max-height: 160px;
  overflow-y: auto;
  border-bottom: 1px solid #1e293b;
  padding: 6px 0;
}
.empty {
  padding: 8px 12px;
  color: #475569;
}
.step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  font-family: monospace;
}
.step-fail {
  color: #fca5a5;
}
.mark {
  width: 14px;
  display: inline-block;
}
.mark-ok {
  color: #4ade80;
}
.mark-fail {
  color: #f87171;
}
.mark-running {
  color: #fbbf24;
}
.num {
  width: 24px;
  color: #64748b;
}
.name {
  flex: 1;
}
.step-dur {
  color: #64748b;
  font-size: 11px;
}
.err-line {
  padding: 4px 12px;
  color: #fca5a5;
  font-family: monospace;
}
.logs {
  flex: 1;
  min-height: 80px;
  overflow-y: auto;
  padding: 6px 12px;
  font-family: monospace;
  font-size: 11px;
  color: #cbd5e1;
}
.log-line {
  white-space: pre-wrap;
}
</style>
