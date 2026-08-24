<!--
  设置页：仅在 Electron 渲染进程下可用
  1. 后端地址：必填，存主进程 userData/config.json
  2. 平台 / 版本：只读
  3. 导入/导出用例 JSON：原生文件对话框
  4. 测试通知：发一条系统通知
-->
<template>
  <div class="settings-page">
    <header class="header">
      <h1>设置</h1>
      <el-button @click="$router.back()">返回</el-button>
    </header>

    <el-alert
      v-if="!isElectron"
      type="warning"
      :closable="false"
      title="当前在浏览器环境，本页部分功能不可用"
      description="仅后端地址配置在浏览器场景也会持久化在 localStorage"
      style="margin-bottom: 16px"
    />

    <el-card class="block" header="后端服务">
      <el-form label-width="120px" style="max-width: 640px">
        <el-form-item label="API Base URL">
          <el-input
            v-model="form.backendBaseUrl"
            placeholder="http://localhost:4000"
            clearable
          />
          <div class="hint">
            例：http://localhost:4000 （去掉末尾的 /api；HTTP 和 WebSocket 会自动转换）
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
          <el-button @click="onTest" :loading="testing">测试连接</el-button>
        </el-form-item>
        <el-form-item v-if="testResult" label="测试结果">
          <el-tag :type="testResult.ok ? 'success' : 'danger'">
            {{ testResult.message }}
          </el-tag>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="block" header="导入 / 导出">
      <el-space wrap>
        <el-button @click="onExport" :disabled="!hasCurrentSpace">
          导出当前空间全部用例
        </el-button>
        <el-button @click="onImport">导入用例 JSON</el-button>
      </el-space>
      <div class="hint">导入会按 ID 覆盖现有同名用例</div>
    </el-card>

    <el-card class="block" header="系统">
      <el-form label-width="120px" style="max-width: 640px">
        <el-form-item label="平台">
          <el-tag>{{ platform }}</el-tag>
        </el-form-item>
        <el-form-item label="应用版本">
          <el-tag>{{ appVersion }}</el-tag>
        </el-form-item>
        <el-form-item>
          <el-button @click="onNotify">发送一条系统通知</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { cases, type CaseFull } from '@/api'
import { useSpaceStore } from '@/stores/space'

interface BackendConfig {
  backendBaseUrl: string
}

const LS_KEY = 'e2e.backendBaseUrl'

const isElectron = computed(() => typeof window !== 'undefined' && !!window.api)

const form = reactive<BackendConfig>({ backendBaseUrl: '' })
const saving = ref(false)
const testing = ref(false)
const testResult = ref<{ ok: boolean; message: string } | null>(null)

const platform = ref('web')
const appVersion = ref('-')

const spaceStore = useSpaceStore()
const hasCurrentSpace = computed(() => !!spaceStore.currentId)

onMounted(async () => {
  // 1) 从主进程拿
  if (isElectron.value) {
    try {
      form.backendBaseUrl = await window.api.getBackendBaseUrl()
      platform.value = await window.api.getPlatform()
      appVersion.value = await window.api.getAppVersion()
    } catch (e: any) {
      ElMessage.error('读取主进程配置失败：' + (e?.message ?? ''))
    }
  } else {
    // 2) 浏览器环境：localStorage 兜底
    form.backendBaseUrl = localStorage.getItem(LS_KEY) ?? ''
    platform.value = 'web'
    appVersion.value = '-'
  }
})

async function onSave() {
  const url = form.backendBaseUrl.trim().replace(/\/+$/, '')
  if (!url) {
    ElMessage.warning('请填写后端地址')
    return
  }
  if (!/^https?:\/\//.test(url)) {
    ElMessage.warning('地址必须以 http:// 或 https:// 开头')
    return
  }
  saving.value = true
  try {
    if (isElectron.value) {
      await window.api.setBackendBaseUrl(url)
    } else {
      localStorage.setItem(LS_KEY, url)
    }
    // 让 api 模块重新读取最新地址
    try {
      const mod = await import('@/api')
      mod.resetBase()
    } catch {
      /* ignore */
    }
    ElMessage.success('已保存')
  } catch (e: any) {
    ElMessage.error('保存失败：' + (e?.message ?? ''))
  } finally {
    saving.value = false
  }
}

async function onTest() {
  testing.value = true
  testResult.value = null
  try {
    // 先保存，保证 fetch 走的就是当前填的 url
    await onSave()
    // 清空 api 缓存，让 ensureBase 重新拉
    const mod = await import('@/api')
    // 走 spaces 接口简单测活
    await mod.spaces.list()
    testResult.value = { ok: true, message: '连通 ✓' }
  } catch (e: any) {
    testResult.value = { ok: false, message: e?.message ?? '失败' }
  } finally {
    testing.value = false
  }
}

async function onExport() {
  if (!hasCurrentSpace.value) return
  if (!isElectron.value) {
    ElMessage.warning('导出需在 Electron 环境')
    return
  }
  const spaceId = spaceStore.currentId!
  let list: CaseFull[]
  try {
    const summaries = await cases.list(spaceId)
    list = await Promise.all(summaries.map((s) => cases.get(s.id)))
  } catch (e: any) {
    ElMessage.error('拉取用例失败：' + (e?.message ?? ''))
    return
  }
  const target = await window.api.saveFileDialog({
    title: '导出用例',
    defaultPath: `cases-${spaceId}-${Date.now()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (!target) return
  try {
    await window.api.writeTextFile(target, JSON.stringify(list, null, 2))
    ElMessage.success(`已导出 ${list.length} 个用例`)
  } catch (e: any) {
    ElMessage.error('写入失败：' + (e?.message ?? ''))
  }
}

async function onImport() {
  if (!isElectron.value) {
    ElMessage.warning('导入需在 Electron 环境')
    return
  }
  const source = await window.api.openFileDialog({
    title: '选择用例 JSON',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (!source) return
  let raw: string
  try {
    raw = await window.api.readTextFile(source)
  } catch (e: any) {
    ElMessage.error('读取失败：' + (e?.message ?? ''))
    return
  }
  let payload: any
  try {
    payload = JSON.parse(raw)
  } catch (e: any) {
    ElMessage.error('JSON 解析失败：' + (e?.message ?? ''))
    return
  }
  const list: CaseFull[] = Array.isArray(payload) ? payload : [payload]
  try {
    await ElMessageBox.confirm(
      `将导入 ${list.length} 个用例（按 ID 覆盖），确定？`,
      '导入确认',
      { type: 'warning', confirmButtonText: '导入', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  let ok = 0
  for (const c of list) {
    try {
      await cases.update(c.id, { name: c.name, schema: c.schema })
      ok++
    } catch {
      // 忽略单个失败
    }
  }
  ElMessage.success(`已导入 ${ok}/${list.length} 个用例`)
}

async function onNotify() {
  if (!isElectron.value) {
    ElMessage.info('通知功能仅在 Electron 可用')
    return
  }
  await window.api.notify('流程引擎', '这是一条系统通知')
}
</script>

<style scoped>
.settings-page {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.block {
  margin-bottom: 16px;
}
.hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
  line-height: 1.6;
}
</style>
