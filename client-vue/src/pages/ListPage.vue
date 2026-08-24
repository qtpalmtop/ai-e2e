<!--
  列表页：当前空间下所有用例 + 空间切换 + 新建/删除用例 + 成员管理
  数据流：
    - 空间：useSpaceStore（持久化 currentId 到 localStorage）
    - 登录用户：useAuthStore
    - 用例列表：本地 ref，watch current.id 时从 cases.list(current.id) 拉
-->
<template>
  <div class="page">
    <header class="header">
      <div class="header-left">
        <h1 class="title">E2E 用例列表</h1>
        <router-link to="/forms" class="link">表单设计器 →</router-link>
      </div>
      <div class="header-right">
        <span class="me">{{ me?.nickname || me?.username }}</span>
        <el-button size="small" plain @click="onLogout">退出</el-button>
      </div>
    </header>

    <!-- 空间选择器 -->
    <div class="space-bar">
      <span class="bar-label">当前空间：</span>
      <el-select
        :model-value="current?.id"
        @change="(v: string) => setCurrent(v)"
        size="default"
        style="width: 240px"
        :disabled="list.length === 0"
      >
        <el-option
          v-for="s in list"
          :key="s.id"
          :value="s.id"
          :label="`${s.name}${s.isDefault ? '（默认）' : ''} · ${roleName(s.role)}`"
        />
      </el-select>

      <template v-if="!creatingSpace">
        <el-button size="small" plain @click="creatingSpace = true">+ 新建空间</el-button>
      </template>
      <template v-else>
        <el-input
          v-model="newSpaceName"
          placeholder="空间名"
          size="default"
          style="width: 180px"
          @keydown.enter="onCreateSpace"
        />
        <el-button size="small" type="primary" @click="onCreateSpace">创建</el-button>
        <el-button size="small" plain @click="creatingSpace = false">取消</el-button>
      </template>

      <el-tag v-if="current?.isDefault" type="info" effect="plain" size="small">
        默认公共空间
      </el-tag>

      <!-- 只有 OWNER 才能管理成员 -->
      <el-button
        v-if="current?.role === 'OWNER'"
        size="small"
        plain
        @click="membersOpen = true"
      >
        成员管理
      </el-button>
    </div>

    <!-- 工具条 -->
    <div class="toolbar">
      <template v-if="!creating">
        <el-button
          type="primary"
          size="default"
          :disabled="!current"
          @click="creating = true"
        >
          + 新建用例
        </el-button>
      </template>
      <template v-else>
        <el-input
          v-model="name"
          placeholder="用例名"
          size="default"
          style="width: 240px"
          @keydown.enter="onCreate"
        />
        <el-button type="primary" size="default" @click="onCreate">创建</el-button>
        <el-button size="default" plain @click="creating = false">取消</el-button>
      </template>
    </div>

    <!-- 用例列表 -->
    <div class="case-list">
      <el-skeleton v-if="loading" :rows="4" animated />
      <el-empty
        v-else-if="caseList.length === 0"
        description="当前空间还没有用例"
      />
      <div
        v-for="c in caseList"
        :key="c.id"
        class="case-row"
      >
        <router-link :to="`/case/${c.id}`" class="case-name">
          {{ c.name }}
        </router-link>
        <span class="case-time">{{ formatTime(c.updatedAt) }}</span>
        <el-button
          size="small"
          type="danger"
          plain
          @click="onDelete(c.id)"
        >
          删除
        </el-button>
      </div>
    </div>

    <SpaceMembersDialog
      v-if="current"
      :open="membersOpen"
      :space-id="current.id"
      :space-name="current.name"
      :my-user-id="me?.id"
      @close="membersOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { cases, type CaseSummary, type SpaceRole } from '@/api'
import { useSpaceStore } from '@/stores/space'
import { useAuthStore } from '@/stores/auth'
import SpaceMembersDialog from '@/components/SpaceMembersDialog.vue'

const router = useRouter()
const auth = useAuthStore()
const me = computed(() => auth.me)
const spaceStore = useSpaceStore()
const list = computed(() => spaceStore.list)
const current = computed(() =>
  list.value.find((s) => s.id === spaceStore.currentId) ?? null,
)
const setCurrent = (id: string) => spaceStore.setCurrent(id)
const createSpace = (name: string) => spaceStore.create(name)

const caseList = ref<CaseSummary[]>([])
const loading = ref(true)

const creating = ref(false)
const name = ref('')

const creatingSpace = ref(false)
const newSpaceName = ref('')

const membersOpen = ref(false)

async function refresh() {
  if (!current.value) {
    caseList.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    caseList.value = await cases.list(current.value.id)
  } catch (e: any) {
    ElMessage.error(e?.message ?? '加载用例失败')
  } finally {
    loading.value = false
  }
}

watch(
  () => current.value?.id,
  () => {
    refresh()
  },
  { immediate: true },
)

async function onCreate() {
  if (!name.value.trim() || !current.value) return
  try {
    const c = await cases.create(current.value.id, name.value.trim())
    name.value = ''
    creating.value = false
    router.push(`/case/${c.id}`)
  } catch (e: any) {
    ElMessage.error(e?.message ?? '创建失败')
  }
}

async function onDelete(id: string) {
  try {
    await ElMessageBox.confirm('确定删除该用例？', '提示', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await cases.remove(id)
    ElMessage.success('已删除')
    refresh()
  } catch (e: any) {
    ElMessage.error(e?.message ?? '删除失败')
  }
}

async function onCreateSpace() {
  const n = newSpaceName.value.trim()
  if (!n) return
  try {
    const s = await createSpace(n)
    setCurrent(s.id)
    newSpaceName.value = ''
    creatingSpace.value = false
  } catch (e: any) {
    ElMessage.error(e?.message ?? '创建空间失败')
  }
}

async function onLogout() {
  await auth.logout()
  router.replace('/login')
}

function roleName(r?: SpaceRole): string {
  switch (r) {
    case 'OWNER':
      return '所有者'
    case 'EDITOR':
      return '编辑者'
    case 'VIEWER':
      return '访客'
    default:
      return '-'
  }
}

function formatTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString()
}
</script>

<style scoped>
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.title {
  font-size: 22px;
  margin: 0;
  color: #0f172a;
}
.link {
  font-size: 12px;
  color: #0ea5e9;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.me {
  color: #64748b;
}
.space-bar {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.bar-label {
  font-size: 12px;
  color: #64748b;
}
.toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.case-list {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  min-height: 120px;
  padding: 4px 0;
}
.case-row {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-top: 1px solid #f1f5f9;
  font-size: 13px;
  gap: 12px;
}
.case-row:first-child {
  border-top: none;
}
.case-name {
  color: #0f172a;
  flex: 1;
  text-decoration: none;
}
.case-name:hover {
  color: #0ea5e9;
}
.case-time {
  color: #94a3b8;
  font-size: 11px;
}
</style>
