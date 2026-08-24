<!--
  画布页（阶段 ④ 含编辑锁 + 实时预览）：
  - 锁状态：
      editing — 我持有锁（可写）
      viewing — 别人持有（只读，看到具体用户）
  - 进入页面立即 tryAcquire
  - editing 状态每 5s 心跳续期；viewing 状态每 5s 重试 tryAcquire
  - unmount 时 5s 延迟释放（条件释放）
  - 关闭标签页：beforeunload + sendBeacon force=true
  - 双重确认 getLock（间隔 100ms）避免 race
  - heartbeat 失败立即放弃持有身份并 tryAcquire 重新评估
-->
<template>
  <div class="page">
    <header class="header">
      <router-link to="/" class="back">← 返回列表</router-link>
      <div class="title">{{ data?.name || '加载中…' }}</div>
      <LockBadge :state="lockState" :my-name="me?.nickname || me?.username" />
      <div class="spacer" />
      <el-button
        size="small"
        :type="showLive ? 'primary' : 'default'"
        @click="showLive = !showLive"
      >
        {{ showLive ? '隐藏预览' : '实时预览' }}
      </el-button>
      <router-link to="/" class="link">完成</router-link>
    </header>

    <!-- 只读提示 -->
    <div v-if="isReadOnly" class="lock-banner" data-testid="lock-banner">
      <span class="lock-icon" aria-hidden>🔒</span>
      <span class="lock-title">只读模式</span>
      <span>
        用户
        <b class="lock-user">{{ holderName }}</b>
        <span v-if="holderSecondary" class="lock-secondary">{{ holderSecondary }}</span>
        正在编辑此用例，你暂时无法修改。
      </span>
    </div>

    <div v-if="loading" class="loading">加载中…</div>
    <div v-else-if="!data" class="loading">用例不存在</div>
    <div v-else class="canvas-host">
      <FlowCanvas
        :initial="data"
        :on-save="handleSave"
        :on-run="handleRun"
        :read-only="isReadOnly"
      />

      <!-- 运行中遮罩 -->
      <div v-if="running" class="mask">正在运行测试...</div>

      <!-- 运行结果面板 -->
      <RunResultPanel
        v-if="runResult && !running"
        :result="runResult"
        @close="runResult = null"
      />

      <!-- 实时预览 -->
      <LivePreview
        v-if="showLive && data"
        :case-id="data.id"
        :on-trigger="handleLiveRun"
        @close="showLive = false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { cases as casesApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import FlowCanvas from '@/components/FlowCanvas.vue'
import LivePreview from '@/components/LivePreview.vue'
import LockBadge from '@/components/LockBadge.vue'
import RunResultPanel from '@/components/RunResultPanel.vue'
import type { CaseSchema, ValidationError } from '@/types/schema'

const HEARTBEAT_MS = 5_000
const RELEASE_DELAY_MS = 5_000

const route = useRoute()
const auth = useAuthStore()
const me = computed(() => auth.me)

const caseId = computed(() => (route.params.id as string) || '')

const data = ref<CaseSchema | null>(null)
const loading = ref(true)
const runResult = ref<{ ok: boolean; logs: string; duration: number } | null>(null)
const running = ref(false)
const showLive = ref(false)

type LockHolder = { id: string; username: string; nickname?: string | null }
type LockState = { kind: 'editing' } | { kind: 'viewing'; by: LockHolder }
const lockState = ref<LockState>({ kind: 'editing' })

// 持有锁的标志位
let holdsLock = false

// 异步任务保护旗
let alive = true
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let pendingReleaseTimer: ReturnType<typeof setTimeout> | null = null

// ---------- 拉数据 ----------
async function load() {
  const id = caseId.value
  if (!id) return
  loading.value = true
  try {
    const c = await casesApi.get(id)
    data.value = c.schema
  } catch (e: any) {
    ElMessage.error(e?.message ?? '加载失败')
    data.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => route.params.id,
  () => {
    // 切换 case → 重新拉数据 + 重置锁（但保留 holdsLock 等的 tear-down 由 effect 负责）
    load()
  },
  { immediate: true },
)

// 释放锁：5s 延迟条件释放
function scheduleDelayedRelease(id: string) {
  if (pendingReleaseTimer) clearTimeout(pendingReleaseTimer)
  pendingReleaseTimer = setTimeout(() => {
    casesApi.releaseLock(id).catch(() => {})
    pendingReleaseTimer = null
  }, RELEASE_DELAY_MS)
}

// 从错误消息中解析 lockedBy
function parseLockedByFromError(msg: string): LockHolder {
  const fallback: LockHolder = { id: '?', username: '其他用户', nickname: null }
  const m = msg.match(/"lockedBy"\s*:\s*(\{[^{}]+\})/)
  if (m) {
    try {
      const o = JSON.parse(m[1])
      if (o && (o.username || o.id)) {
        return { id: o.id, username: o.username, nickname: o.nickname ?? null }
      }
    } catch {
      /* fallthrough */
    }
  }
  const u = msg.match(/"username"\s*:\s*"([^"]+)"/)
  const n = msg.match(/"nickname"\s*:\s*"([^"]+)"/)
  const id = msg.match(/"id"\s*:\s*"([^"]+)"/)
  if (u) return { id: id?.[1] ?? '?', username: u[1], nickname: n?.[1] ?? null }
  return fallback
}

async function tryAcquire(id: string) {
  if (!alive) return
  try {
    await casesApi.acquireLock(id)
    if (!alive) {
      // 组件已 unmount：延迟释放
      scheduleDelayedRelease(id)
      return
    }
    // 二次确认：连续 2 次 getLock 都 mine=true 才确认持有
    const info1 = await casesApi.getLock(id)
    if (!info1.mine) {
      throw new Error(
        `409 Conflict: ${JSON.stringify({
          message: 'lock not owned after acquire (1st check)',
          lockedBy: info1.lockedBy,
        })}`,
      )
    }
    await new Promise((r) => setTimeout(r, 100))
    if (!alive) {
      scheduleDelayedRelease(id)
      return
    }
    const info2 = await casesApi.getLock(id)
    if (!info2.mine) {
      throw new Error(
        `409 Conflict: ${JSON.stringify({
          message: 'lock not owned after acquire (2nd check)',
          lockedBy: info2.lockedBy,
        })}`,
      )
    }
    holdsLock = true
    lockState.value = { kind: 'editing' }
  } catch (e: any) {
    if (!alive) return
    const msg: string = e?.message ?? ''
    if (!/^409/.test(msg)) {
      // 非冲突错误：保持当前状态
      console.warn('acquireLock non-409 error:', msg)
      return
    }
    // 冲突 409
    let by: LockHolder = { id: '?', username: '其他用户', nickname: null }
    let lockEmpty = false
    try {
      const info = await casesApi.getLock(id)
      if (info.lockedBy) {
        by = {
          id: info.lockedBy.id,
          username: info.lockedBy.username,
          nickname: info.lockedBy.nickname,
        }
      } else {
        lockEmpty = true
      }
    } catch {
      by = parseLockedByFromError(msg)
    }
    if (lockEmpty) {
      setTimeout(() => {
        if (alive) tryAcquire(id)
      }, 200)
      return
    }
    holdsLock = false
    lockState.value = { kind: 'viewing', by }
  }
}

async function tick(id: string) {
  if (!alive) return
  if (holdsLock) {
    try {
      await casesApi.heartbeat(id)
    } catch {
      // 心跳失败：立即放弃持有身份，重新评估
      holdsLock = false
      tryAcquire(id)
    }
  } else {
    tryAcquire(id)
  }
}

// ---------- 编辑锁生命周期 ----------
function startLockEffect(id: string) {
  alive = true
  // 首次
  tryAcquire(id)
  // 5s 周期
  heartbeatTimer = setInterval(() => tick(id), HEARTBEAT_MS)
  // beforeunload：force=true 立即释放
  window.addEventListener('beforeunload', onUnload)
}

function stopLockEffect(id: string) {
  alive = false
  window.removeEventListener('beforeunload', onUnload)
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (holdsLock) {
    holdsLock = false
    scheduleDelayedRelease(id)
  }
}

function onUnload() {
  if (!holdsLock) return
  holdsLock = false
  try {
    const id = caseId.value
    if (!id) return
    const url = `/api/cases/${id}/release-lock`
    const blob = new Blob([JSON.stringify({ force: true })], { type: 'application/json' })
    navigator.sendBeacon?.(url, blob)
  } catch {
    /* ignore */
  }
}

// 锁生命周期与 caseId 绑定
watch(
  () => caseId.value,
  (id, prev) => {
    if (prev) stopLockEffect(prev)
    if (id) startLockEffect(id)
  },
)

onBeforeUnmount(() => {
  const id = caseId.value
  if (id) stopLockEffect(id)
})

// ---------- 保存 / 运行 / live-run ----------
async function handleSave(next: CaseSchema, _errors: ValidationError[]) {
  if (isReadOnly.value) {
    ElMessage.warning(`当前用例正在被「${holderName.value}」编辑，无法保存`)
    return
  }
  try {
    const saved = await casesApi.update(data.value!.id, { schema: next })
    data.value = saved.schema
  } catch (e: any) {
    const msg: string = e?.message ?? ''
    if (msg.includes('409') || msg.includes('locked')) {
      ElMessage.error('保存失败：编辑锁已被其他用户抢占')
      lockState.value = {
        kind: 'viewing',
        by: { id: '?', username: '其他用户', nickname: null },
      }
    } else {
      ElMessage.error(`保存失败：${msg}`)
    }
  }
}

async function handleRun() {
  if (!data.value) return
  running.value = true
  runResult.value = null
  try {
    await casesApi.translate(data.value.id)
    const r = await casesApi.run(data.value.id)
    runResult.value = r
  } catch (e: any) {
    runResult.value = { ok: false, logs: e?.message ?? '运行失败', duration: 0 }
  } finally {
    running.value = false
  }
}

async function handleLiveRun() {
  if (!data.value) return
  await casesApi.translate(data.value.id)
  await casesApi.liveRun(data.value.id)
}

// ---------- 视图派生 ----------
const isReadOnly = computed(() => lockState.value.kind === 'viewing')
const holderName = computed(() => {
  if (lockState.value.kind !== 'viewing') return ''
  return (
    lockState.value.by.nickname?.trim() ||
    lockState.value.by.username ||
    '其他用户'
  )
})
const holderSecondary = computed(() => {
  if (lockState.value.kind !== 'viewing' || !lockState.value.by.nickname) return ''
  return `（@${lockState.value.by.username}）`
})
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
  gap: 12px;
  z-index: 5;
}
.back {
  color: #0f172a;
  text-decoration: none;
  font-size: 14px;
}
.title {
  font-weight: 600;
  font-size: 16px;
  color: #0f172a;
}
.spacer {
  flex: 1;
}
.link {
  color: #0f172a;
  text-decoration: none;
  font-size: 14px;
  padding: 4px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}
.lock-banner {
  background: #fef2f2;
  color: #991b1b;
  border-bottom: 1px solid #fecaca;
  padding: 10px 16px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.lock-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fee2e2;
  font-size: 14px;
}
.lock-title {
  font-weight: 700;
}
.lock-user {
  margin: 0 4px;
}
.lock-secondary {
  color: #b45309;
}
.loading {
  padding: 24px;
  color: #64748b;
}
.canvas-host {
  flex: 1;
  position: relative;
  min-height: 0;
}
.mask {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
}
</style>
