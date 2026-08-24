<!--
  表单画布（中间）— 所见即所得
  - 列表渲染：每个原子作为一张「表单字段卡片」直接展示（AtomInput 嵌入）
  - 联动规则实时生效：visible/required/disabled/error 由 formRules 计算
  - 选中态：卡片蓝边高亮 + 右上角 × 按钮（在 FormCanvasItem 内）
  - 拖入新原子：空状态有专门的 drop zone
  - 顶部 max-width 720px 居中，更接近实际 el-form 渲染宽度
-->
<template>
  <div
    class="canvas"
    @dragover="onCanvasDragOver"
  >
    <div class="title-row">
      <div class="title">表单预览</div>
      <div class="desc">所见即所得 — 拖入新原子或拖动排序，点击字段以编辑</div>
    </div>

    <div class="form">
      <template v-if="schema.atoms.length === 0">
        <div
          class="empty-zone"
          :class="{ active: emptyActive }"
          @dragenter="onEmptyEnter"
          @dragleave="onEmptyLeave"
          @dragover="onEmptyOver"
          @drop="onEmptyDrop"
        >
          <div class="empty-title">从左侧拖入原子开始构建表单</div>
          <div class="empty-hint">提示：每个原子将以最终表单 UI 渲染</div>
        </div>
      </template>

      <template v-else>
        <template v-for="atom in visibleAtoms" :key="atom.id">
          <FormCanvasItem
            :atom="atom"
            :selected="selectedId === atom.id"
            :hint="dropHint?.id === atom.id ? dropHint.pos : null"
            :is-dragging="draggingId === atom.id"
            :value="data[atom.name] ?? atom.defaultValue"
            :required="isRequired(atom, data)"
            :disabled="isDisabled(atom, data)"
            :error="requiredMessage(atom, data) ?? undefined"
            :on-change="(v) => setVal(atom.name, v)"
            @hint="(pos) => onHint(atom.id, pos)"
            @insert="(type, pos) => onInsert(atom, type, pos)"
            @move="(fromId, pos) => onMove(atom, fromId, pos)"
            @select="emit('select', atom.id)"
            @delete="emit('delete', atom.id)"
            @drag-start="onItemDragStart"
            @drag-end="onItemDragEnd"
          />
        </template>
        <div
          v-if="schema.atoms.length > 0 && visibleAtoms.length === 0"
          class="all-hidden-hint"
        >
          所有字段都被联动规则隐藏了，尝试修改其他字段看效果
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormAtom, FormSchema } from '@/types/formSchema'
import type { AtomType } from '@/types/formSchema'
import FormCanvasItem from './FormCanvasItem.vue'
import {
  isVisible,
  isRequired,
  isDisabled,
  requiredMessage,
} from '@/lib/formRules'

const props = defineProps<{
  schema: FormSchema
  selectedId: string | null
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'reorder', fromId: string, toIndex: number): void
  (e: 'delete', id: string): void
  (e: 'add', type: AtomType, index: number): void
}>()

type HintPos = 'before' | 'after'
const dropHint = ref<{ id: string; pos: HintPos } | null>(null)
const draggingId = ref<string | null>(null)
const emptyActive = ref(false)
let emptyCounter = 0

// 联动规则用到的 form data：写回本地
const data = reactive<Record<string, unknown>>({})

// 过滤掉 visible=false 的原子（保留原始 schema 顺序，list 中也保留位置以便 hint 定位）
const visibleAtoms = computed<FormAtom[]>(() =>
  props.schema.atoms.filter((a) => isVisible(a, data)),
)

function setVal(name: string, v: unknown) {
  data[name] = v
}

function isAtomDrag(e: DragEvent): boolean {
  if (!e.dataTransfer) return false
  const types = e.dataTransfer.types
  return (
    types.includes('application/x-atom-type') ||
    types.includes('application/x-atom-reorder')
  )
}

// ---------- 空画布 drop zone ----------

function onEmptyEnter(e: DragEvent) {
  if (!e.dataTransfer?.types.includes('application/x-atom-type')) return
  emptyCounter += 1
  emptyActive.value = true
}

function onEmptyLeave(e: DragEvent) {
  if (!e.dataTransfer?.types.includes('application/x-atom-type')) return
  emptyCounter -= 1
  if (emptyCounter <= 0) {
    emptyCounter = 0
    emptyActive.value = false
  }
}

function onEmptyOver(e: DragEvent) {
  if (!e.dataTransfer?.types.includes('application/x-atom-type')) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

function onEmptyDrop(e: DragEvent) {
  e.preventDefault?.()
  emptyCounter = 0
  emptyActive.value = false
  const t = e.dataTransfer?.getData('application/x-atom-type') as AtomType
  if (t) emit('add', t, 0)
}

// ---------- 非空画布：拖到空白区时也允许 drop ----------

function onCanvasDragOver(e: DragEvent) {
  if (e.target === e.currentTarget && isAtomDrag(e)) {
    e.preventDefault()
  }
}

// ---------- item 之间的事件转发 ----------

function onHint(id: string, pos: HintPos | null) {
  if (pos === null) {
    if (dropHint.value?.id === id) dropHint.value = null
  } else {
    dropHint.value = { id, pos }
  }
}

function onInsert(target: FormAtom, type: AtomType, pos: HintPos) {
  dropHint.value = null
  // 用「真实 schema 索引」（不包含被联动隐藏的）
  const idx = props.schema.atoms.findIndex((a) => a.id === target.id)
  if (idx < 0) return
  const insertIndex = pos === 'before' ? idx : idx + 1
  emit('add', type, insertIndex)
}

function onMove(target: FormAtom, fromId: string, pos: HintPos) {
  dropHint.value = null
  if (fromId === target.id) return
  const idx = props.schema.atoms.findIndex((a) => a.id === target.id)
  if (idx < 0) return
  const insertIndex = pos === 'before' ? idx : idx + 1
  emit('reorder', fromId, insertIndex)
}

function onItemDragStart(id: string) {
  draggingId.value = id
  dropHint.value = null
}

function onItemDragEnd() {
  draggingId.value = null
  dropHint.value = null
}
</script>

<style scoped>
.canvas {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  overflow: hidden;
}
.title-row {
  padding: 12px 16px 8px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.title {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}
.desc {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}
.form {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 16px 60px;
  box-sizing: border-box;
  /* 表单区域最大宽度 720px 居中，贴近实际 el-form 渲染尺寸 */
  max-width: 760px;
  margin: 0 auto;
  width: 100%;
}

.empty-zone {
  background: #fff;
  border: 2px dashed #cbd5e1;
  border-radius: 10px;
  padding: 48px 24px;
  text-align: center;
  color: #94a3b8;
  transition: all 0.12s;
}
.empty-zone.active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #3b82f6;
}
.empty-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}
.empty-hint {
  font-size: 12px;
  color: #94a3b8;
}
.empty-zone.active .empty-hint {
  color: #3b82f6;
}

.all-hidden-hint {
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
  padding: 24px 8px;
  background: #fff;
  border: 1px dashed #e2e8f0;
  border-radius: 8px;
}
</style>
