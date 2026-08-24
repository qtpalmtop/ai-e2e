<!--
  节点配置面板：选中节点后浮在画布右侧
  - 节点名称（label）始终可编辑
  - 动态原子通过 useFormSchemaStore 拉取
  - 联动规则 visible/required/disabled 在外部计算后传入 AtomInput
  - 只读模式下整面板禁用
  - 点击外部关闭（与 React 版一致，使用 mousedown + 0ms 延迟）
-->
<template>
  <aside
    v-if="selected && nodeType"
    ref="panelRef"
    class="panel"
    @click.stop
  >
    <div class="header">
      <div>
        <div class="sec">节点配置</div>
        <div class="title">{{ NODE_LABELS[nodeType as keyof typeof NODE_LABELS] }}</div>
      </div>
      <button class="close-btn" aria-label="关闭" @click="close">×</button>
    </div>

    <!-- label 始终可编辑（即使只读模式也可以改名字？这里跟随 React 行为：只读禁用） -->
    <div class="field">
      <label class="label">
        节点名称<span class="required">*</span>
      </label>
      <input
        class="ctrl"
        :disabled="!!readOnly"
        :value="draft.label ?? ''"
        @input="(e) => updateField('label', (e.target as HTMLInputElement).value)"
      />
    </div>

    <el-empty
      v-if="visibleAtoms.length === 0"
      :description="'此节点无需配置。可在「表单设计」中为此节点类型添加表单原子。'"
      :image-size="60"
    />

    <AtomInput
      v-for="atom in visibleAtoms"
      :key="atom.id"
      :atom="atom"
      :value="draft[atom.name]"
      :on-change="(v: unknown) => updateField(atom.name, v)"
      :disabled="isDisabled(atom, draft) || !!readOnly"
      :required="isRequired(atom, draft)"
      :error="errorFor(atom.name)"
    />

    <div class="hint">
      {{
        readOnly
          ? '只读模式：当前用例正在被其他用户编辑，修改不会保存'
          : '修改实时保存到画布；点击面板外关闭'
      }}
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NODE_LABELS } from '@/config/nodeSchemas'
import { useCanvasStore } from '@/stores/canvas'
import { useFormSchemaStore } from '@/stores/formSchema'
import { useSpaceStore } from '@/stores/space'
import { isVisible, isRequired, isDisabled, requiredMessage } from '@/lib/formRules'
import AtomInput from './formDesigner/AtomInput.vue'
import type { FormAtom, FormSchema } from '@/types/formSchema'
import type { ValidationError } from '@/types/schema'

const props = defineProps<{
  readOnly?: boolean
}>()

const EMPTY: FormSchema = { atoms: [] }

const canvas = useCanvasStore()
const formStore = useFormSchemaStore()
const space = useSpaceStore()

// 选中节点
const selectedId = computed(() => canvas.selectedId)
const selected = computed(() => {
  const id = selectedId.value
  if (!id) return null
  const n = canvas.nodes.find((x) => x.id === id)
  if (!n) return null
  return { id: n.id, type: (n.type as string) ?? '', data: n.data as Record<string, unknown> }
})
const nodeType = computed(() => selected.value?.type ?? null)

// 拉一次表单 schema
onMounted(() => {
  if (!formStore.fetched) formStore.fetchAll()
})
watch(
  () => space.currentId,
  () => {
    // 切换空间后重新拉
    formStore.fetchAll()
  },
)

// 动态表单 schema（按当前选中节点类型）
const formSchema = computed<FormSchema>(() => {
  const t = nodeType.value
  if (!t) return EMPTY
  const sid = space.currentId
  if (!sid) return EMPTY
  return formStore.bySpace[sid]?.[t] ?? EMPTY
})

// 当前节点错误
const nodeErrors = computed<ValidationError[]>(() => {
  if (!selectedId.value) return []
  return canvas.errors.filter((e) => e.nodeId === selectedId.value)
})

// draft：选中节点切换时同步
const draft = ref<Record<string, unknown>>({})
watch(
  () => selected.value?.id,
  () => {
    draft.value = selected.value ? { ...selected.value.data } : {}
  },
  { immediate: true },
)

// 当前可见的原子
const visibleAtoms = computed<FormAtom[]>(() => {
  if (!nodeType.value) return []
  return formSchema.value.atoms.filter((a) => isVisible(a, draft.value))
})

function commit(next: Record<string, unknown>) {
  if (props.readOnly) return
  draft.value = next
  if (selected.value) canvas.updateNodeData(selected.value.id, next)
}

function updateField(k: string, v: unknown) {
  commit({ ...draft.value, [k]: v })
}

function errorFor(name: string): string | undefined {
  const id = selectedId.value
  if (!id) return undefined
  const atom = visibleAtoms.value.find((a) => a.name === name)
  if (!atom) return undefined
  return (
    nodeErrors.value.find((e) => e.fieldName === name)?.message ??
    requiredMessage(atom, draft.value) ??
    undefined
  )
}

function close() {
  canvas.setSelectedId(null)
}

// 点击外部关闭
const panelRef = ref<HTMLElement | null>(null)
function onDocMouseDown(e: MouseEvent) {
  if (!selectedId.value) return
  const el = panelRef.value
  if (!el) return
  if (e.target instanceof Node && el.contains(e.target)) return
  canvas.setSelectedId(null)
}
onMounted(() => {
  // 0ms 延迟，避免点开节点时立刻被自己关掉
  setTimeout(() => document.addEventListener('mousedown', onDocMouseDown), 0)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
})
</script>

<style scoped>
.panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 320px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  padding: 16px;
  z-index: 20;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.sec {
  font-size: 11px;
  color: #64748b;
}
.title {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}
.close-btn {
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  color: #94a3b8;
  line-height: 1;
}
.field {
  margin-bottom: 12px;
}
.label {
  display: block;
  font-size: 12px;
  color: #334155;
  margin-bottom: 4px;
}
.required {
  color: #ef4444;
  margin-left: 4px;
}
.ctrl {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  background: #fff;
  color: #0f172a;
}
.ctrl:disabled {
  background: #f1f5f9;
  color: #94a3b8;
  cursor: not-allowed;
}
.hint {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 8px;
}
</style>
