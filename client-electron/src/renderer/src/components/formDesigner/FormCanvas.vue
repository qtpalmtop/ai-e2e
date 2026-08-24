<!--
  表单画布（中间）
  - 两种 drop 来源：
    1. 调色板拖入 (application/x-atom-type)   → 新建原子
    2. 已有原子拖动 (application/x-atom-reorder) → 排序
  - 插入位置判定：拖到 item 上半部分 → before；下半部分 → after
  - 占位线（蓝色 4px）渲染在 item 上方或下方
  - 空状态时整个画布是 drop zone
-->
<template>
  <div
    class="canvas"
    @dragover="onCanvasDragOver"
  >
    <div class="title">表单画布</div>
    <div class="desc">拖入新原子，或拖动已有原子调整顺序；点击选中以编辑</div>

    <template v-if="schema.atoms.length === 0">
      <div
        class="empty-zone"
        :class="{ active: emptyActive }"
        @dragenter="onEmptyEnter"
        @dragleave="onEmptyLeave"
        @dragover="onEmptyOver"
        @drop="onEmptyDrop"
      >
        从左侧拖入原子开始构建表单
      </div>
    </template>

    <template v-else>
      <div v-for="(atom, i) in schema.atoms" :key="atom.id">
        <FormCanvasItem
          :atom="atom"
          :selected="selectedId === atom.id"
          :hint="dropHint?.id === atom.id ? dropHint.pos : null"
          :is-dragging="draggingId === atom.id"
          @hint="(pos) => onHint(atom.id, pos)"
          @insert="(type, pos) => onInsert(atom, i, type, pos)"
          @move="(fromId, pos) => onMove(atom, i, fromId, pos)"
          @select="emit('select', atom.id)"
          @delete="emit('delete', atom.id)"
          @drag-start="onItemDragStart"
          @drag-end="onItemDragEnd"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { FormAtom, FormSchema } from '@/types/formSchema'
import type { AtomType } from '@/types/formSchema'
import FormCanvasItem from './FormCanvasItem.vue'

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

function isAtomDrag(e: DragEvent): boolean {
  if (!e.dataTransfer) return false
  const types = e.dataTransfer.types
  return (
    types.includes('application/x-atom-type') ||
    types.includes('application/x-atom-reorder')
  )
}

function isReorder(e: DragEvent): boolean {
  return !!e.dataTransfer?.types.includes('application/x-atom-reorder')
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

// ---------- 非空画布：拖到空白区（不是 item）时也要允许 drop ----------

function onCanvasDragOver(e: DragEvent) {
  // 仅在画布空白处（非 item 内）允许 drop；具体位置由子项决定
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

function onInsert(_atom: FormAtom, index: number, type: AtomType, pos: HintPos) {
  dropHint.value = null
  const insertIndex = pos === 'before' ? index : index + 1
  emit('add', type, insertIndex)
}

function onMove(_atom: FormAtom, index: number, fromId: string, pos: HintPos) {
  dropHint.value = null
  if (fromId === _atom.id) return
  const insertIndex = pos === 'before' ? index : index + 1
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
  padding: 12px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
}
.title {
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 8px;
}
.desc {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 12px;
}
.empty-zone {
  border: 2px dashed #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  transition: all 0.12s;
}
.empty-zone.active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #3b82f6;
}
</style>
