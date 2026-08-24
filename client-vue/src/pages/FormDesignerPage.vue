<!--
  表单设计器主页面
  3 列布局：
    左：原子面板（按白名单过滤）
    中：表单画布（拖入 / 排序 / 删除）+ 实时预览
    右：检查器（编辑选中原子的 label / required / 默认值 / 联动规则）
-->
<template>
  <div class="page">
    <!-- 顶部 -->
    <header class="topbar">
      <el-button size="small" plain @click="goBack">← 返回列表</el-button>
      <div class="page-title">表单设计器</div>
      <el-select
        v-model="nodeType"
        size="default"
        style="width: 160px"
      >
        <el-option
          v-for="t in NODE_TYPES"
          :key="t"
          :value="t"
          :label="NODE_LABELS[t]"
        />
      </el-select>
      <span v-if="dirty" class="dirty">● 未保存</span>
      <div class="spacer" />
      <span v-if="msg" class="msg">{{ msg }}</span>
      <el-button size="small" type="danger" plain @click="handleReset">重置默认</el-button>
      <el-button
        size="small"
        type="primary"
        :loading="saving"
        :disabled="!dirty"
        @click="handleSave"
      >
        {{ saving ? '保存中…' : '保存' }}
      </el-button>
    </header>

    <!-- 3 列 -->
    <div class="cols">
      <!-- 左：原子面板 -->
      <div class="col col-left">
        <AtomPalette :node-type="nodeType" />
      </div>

      <!-- 中：画布（所见即所得） -->
      <div class="col col-mid">
        <FormCanvas
          :schema="draft"
          :selected-id="selectedId"
          @select="setSelectedId"
          @reorder="reorder"
          @delete="removeAtom"
          @add="addAtom"
        />
      </div>

      <!-- 右：检查器 -->
      <div class="col col-right">
        <AtomInspector
          v-if="selectedAtom"
          :atom="selectedAtom"
          :candidate-fields="draft.atoms"
          @update="(next) => updateAtom(selectedAtom!.id, next)"
        />
        <div v-else class="empty-inspector">
          从画布选择一个原子以编辑
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { nanoid } from 'nanoid'
import { useFormSchemaStore } from '@/stores/formSchema'
import { useSpaceStore } from '@/stores/space'
import { ATOM_LIBRARY } from '@/types/formSchema'
import type { AtomType, FormAtom, FormSchema } from '@/types/formSchema'
import type { NodeType } from '@/types/schema'
import { NODE_LABELS } from '@/config/nodeSchemas'
import AtomPalette from '@/components/formDesigner/AtomPalette.vue'
import FormCanvas from '@/components/formDesigner/FormCanvas.vue'
import AtomInspector from '@/components/formDesigner/AtomInspector.vue'

const router = useRouter()
const formStore = useFormSchemaStore()
const space = useSpaceStore()

const NODE_TYPES: NodeType[] = [
  'openPage',
  'inputText',
  'clickElement',
  'hoverElement',
  'wait',
  'condition',
  'loop',
]

const nodeType = ref<NodeType>('openPage')
const draft = ref<FormSchema>({ atoms: [] })
const selectedId = ref<string | null>(null)
const dirty = ref(false)
const msg = ref<string | null>(null)
const saving = ref(false)

const serverSchema = computed<FormSchema>(() => {
  const sid = space.currentId
  if (!sid) return { atoms: [] }
  return formStore.bySpace[sid]?.[nodeType.value] ?? { atoms: [] }
})

const selectedAtom = computed<FormAtom | null>(
  () => draft.value.atoms.find((a) => a.id === selectedId.value) ?? null,
)

onMounted(() => {
  if (!formStore.fetched) formStore.fetchAll()
})

// 切节点类型 → 重置 draft
watch(
  [serverSchema, nodeType],
  () => {
    draft.value = { atoms: serverSchema.value.atoms.map((a) => ({ ...a })) }
    selectedId.value = null
    dirty.value = false
  },
  { immediate: true },
)

function showMsg(text: string) {
  msg.value = text
  setTimeout(() => {
    if (msg.value === text) msg.value = null
  }, 1500)
}

function goBack() {
  router.push('/')
}

function updateAtom(id: string, patch: Partial<FormAtom>) {
  draft.value = {
    atoms: draft.value.atoms.map((a) =>
      a.id === id ? { ...a, ...patch } : a,
    ),
  }
  dirty.value = true
}

function addAtom(type: AtomType, index: number) {
  const meta = ATOM_LIBRARY.find((m) => m.type === type)
  if (!meta) return
  const id = `a-${nanoid(6)}`
  const baseName = `${type}${draft.value.atoms.filter((a) => a.type === type).length + 1}`
  const atom: FormAtom = {
    id,
    type,
    name: baseName,
    label: meta.label,
    required: false,
    rules: [],
    ...meta.defaultProps,
  }
  const next = draft.value.atoms.slice()
  next.splice(index, 0, atom)
  draft.value = { atoms: next }
  selectedId.value = id
  dirty.value = true
}

function reorder(fromId: string, toIndex: number) {
  const fromIndex = draft.value.atoms.findIndex((a) => a.id === fromId)
  if (fromIndex < 0) return
  const next = draft.value.atoms.slice()
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  draft.value = { atoms: next }
  dirty.value = true
}

function removeAtom(id: string) {
  draft.value = { atoms: draft.value.atoms.filter((a) => a.id !== id) }
  if (selectedId.value === id) selectedId.value = null
  dirty.value = true
}

function setSelectedId(id: string | null) {
  selectedId.value = id
}

async function handleSave() {
  saving.value = true
  try {
    await formStore.save(nodeType.value, draft.value)
    dirty.value = false
    showMsg('已保存')
  } catch (e: any) {
    ElMessage.error(e?.message ?? '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleReset() {
  try {
    await ElMessageBox.confirm('重置全部节点类型的表单为默认值？', '提示', {
      type: 'warning',
      confirmButtonText: '重置',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await formStore.reset()
    showMsg('已重置为默认')
  } catch (e: any) {
    ElMessage.error(e?.message ?? '重置失败')
  }
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.topbar {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  gap: 12px;
  z-index: 5;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}
.dirty {
  font-size: 11px;
  color: #f59e0b;
}
.spacer {
  flex: 1;
}
.msg {
  font-size: 12px;
  color: #0f172a;
}
.cols {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.col {
  height: 100%;
  overflow: hidden;
}
.col-left {
  width: 240px;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
}
.col-mid {
  flex: 1;
  background: #fff;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.col-right {
  width: 320px;
  background: #f8fafc;
  border-left: 1px solid #e2e8f0;
}
.empty-inspector {
  padding: 16px;
  font-size: 12px;
  color: #94a3b8;
}
</style>
