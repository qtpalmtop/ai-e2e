<!--
  空间成员管理弹窗（仅 OWNER 可见）
  后端能力：
    POST   /api/spaces/:spaceId/members         按 username 邀请 + upsert role
    DELETE /api/spaces/:spaceId/members/:userId  移除（不能移除自己 / OWNER）
  这里把它包装成 el-dialog：拉详情 → 改角色/移除/添加 → 重新拉
-->
<template>
  <el-dialog
    :model-value="open"
    @update:model-value="(v: boolean) => !v && onClose()"
    :title="`空间成员 · ${spaceName}`"
    width="520px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div v-if="error" class="err-tip">{{ error }}</div>

    <div class="sec-title">当前成员（{{ members.length }}）</div>
    <div class="member-list">
      <el-skeleton v-if="loading" :rows="3" animated />
      <el-empty v-else-if="members.length === 0" description="暂无成员" :image-size="60" />
      <div v-for="m in members" :key="m.userId" class="member-row">
        <div class="member-info">
          <div class="member-name">{{ m.username }}</div>
          <div v-if="m.nickname" class="member-nick">{{ m.nickname }}</div>
        </div>

        <template v-if="m.role === 'OWNER'">
          <el-tag type="primary" size="small" effect="light">所有者</el-tag>
        </template>
        <template v-else>
          <el-select
            :model-value="m.role"
            @change="(v: SpaceRole) => handleChangeRole(m, v)"
            size="small"
            style="width: 96px"
            :disabled="m.userId === myUserId"
          >
            <el-option label="编辑者" value="EDITOR" />
            <el-option label="访客" value="VIEWER" />
          </el-select>
        </template>

        <el-button
          size="small"
          type="danger"
          plain
          :disabled="m.userId === myUserId || m.role === 'OWNER'"
          @click="handleRemove(m)"
        >
          移除
        </el-button>
      </div>
    </div>

    <el-divider />

    <div class="sec-title">添加成员（按用户名）</div>
    <div class="add-row">
      <el-input
        v-model="newUsername"
        placeholder="用户名"
        size="default"
        clearable
        @keydown.enter="handleAdd"
      />
      <el-select v-model="newRole" size="default" style="width: 110px">
        <el-option label="编辑者" value="EDITOR" />
        <el-option label="访客" value="VIEWER" />
      </el-select>
      <el-button
        type="primary"
        :loading="adding"
        :disabled="!newUsername.trim()"
        @click="handleAdd"
      >
        {{ adding ? '添加中…' : '添加' }}
      </el-button>
    </div>
    <div class="hint">用户名不存在时会提示错误；添加后该用户重新进入列表即可看到此空间。</div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { spaces, type SpaceRole, type SpaceMember } from '@/api'

const props = defineProps<{
  open: boolean
  spaceId: string
  spaceName: string
  myUserId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function onClose() {
  emit('close')
}

const members = ref<SpaceMember[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const newUsername = ref('')
const newRole = ref<SpaceRole>('EDITOR')
const adding = ref(false)

async function reload() {
  loading.value = true
  error.value = null
  try {
    const d = await spaces.get(props.spaceId)
    members.value = d.members
  } catch (e: any) {
    error.value = e?.message ?? '加载成员失败'
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.open, props.spaceId],
  ([open]) => {
    if (open) {
      newUsername.value = ''
      newRole.value = 'EDITOR'
      reload()
    }
  },
  { immediate: true },
)

async function handleChangeRole(m: SpaceMember, role: SpaceRole) {
  if (m.role === role) return
  error.value = null
  try {
    await spaces.addMember(props.spaceId, m.username, role)
    await reload()
  } catch (e: any) {
    error.value = e?.message ?? '修改角色失败'
  }
}

async function handleRemove(m: SpaceMember) {
  if (m.userId === props.myUserId) {
    error.value = '不能移除自己'
    return
  }
  try {
    await ElMessageBox.confirm(`确定移除成员「${m.username}」？`, '提示', {
      type: 'warning',
      confirmButtonText: '移除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  error.value = null
  try {
    await spaces.removeMember(props.spaceId, m.userId)
    await reload()
  } catch (e: any) {
    error.value = e?.message ?? '移除失败'
  }
}

async function handleAdd() {
  const u = newUsername.value.trim()
  if (!u) return
  adding.value = true
  error.value = null
  try {
    await spaces.addMember(props.spaceId, u, newRole.value)
    newUsername.value = ''
    newRole.value = 'EDITOR'
    await reload()
  } catch (e: any) {
    error.value = e?.message ?? '添加失败'
  } finally {
    adding.value = false
  }
}
</script>

<style scoped>
.err-tip {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 12px;
}
.sec-title {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 8px;
}
.member-list {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
  min-height: 60px;
}
.member-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid #f1f5f9;
  font-size: 13px;
}
.member-row:first-child {
  border-top: none;
}
.member-info {
  flex: 1;
  min-width: 0;
}
.member-name {
  font-weight: 500;
  color: #0f172a;
}
.member-nick {
  color: #94a3b8;
  font-size: 11px;
}
.add-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.add-row .el-input {
  flex: 1;
}
.hint {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 8px;
}
</style>
