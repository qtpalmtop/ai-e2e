<!--
  画布单项（FormCanvas 内部用）— 所见即所得
  - 外层卡片：默认/选中/拖拽中 三种态
  - 内部：AtomInput 渲染，label + 控件 + help + error 全部按 el-form 风格展示
  - 拖拽手柄在左侧（cursor: grab）
  - 删除按钮在右上角（仅 selected 时显示）
  - 联动规则（visible/required/disabled/error）由 FormCanvas 把 data 算好透传下来
  - 自身作为 drag source：atom.id 写到 application/x-atom-reorder
  - 自身作为 drop target：按鼠标 Y 坐标判定 before/after
-->
<template>
  <div>
    <!-- before 占位线 -->
    <div v-if="hint === 'before'" class="drop-line" />

    <div
      ref="el"
      class="item"
      :class="{
        selected,
        dragging: isDragging,
        'has-error': Boolean(error),
      }"
      draggable="true"
      @click="emit('select')"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <!-- 左侧：拖拽手柄 -->
      <span class="handle" aria-hidden title="拖动排序">⋮⋮</span>

      <!-- 中间：表单字段（所见即所得） -->
      <div class="body">
        <AtomInput
          :atom="atom"
          :value="value"
          :on-change="onChange"
          :disabled="disabled"
          :required="required"
          :error="error"
        />
      </div>

      <!-- 右上角：删除按钮（仅选中时显示） -->
      <button
        v-if="selected"
        class="del"
        title="删除字段"
        @click.stop="emit('delete')"
      >
        ×
      </button>
    </div>

    <!-- after 占位线 -->
    <div v-if="hint === 'after'" class="drop-line" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { FormAtom, AtomType } from '@/types/formSchema'
import AtomInput from './AtomInput.vue'

const props = defineProps<{
  atom: FormAtom
  selected: boolean
  hint: 'before' | 'after' | null
  isDragging: boolean
  value: unknown
  required?: boolean
  disabled?: boolean
  error?: string
  onChange: (v: unknown) => void
}>()

const emit = defineEmits<{
  (e: 'select'): void
  (e: 'delete'): void
  (e: 'hint', pos: 'before' | 'after' | null): void
  (e: 'insert', type: AtomType, pos: 'before' | 'after'): void
  (e: 'move', fromId: string, pos: 'before' | 'after'): void
  (e: 'drag-start', id: string): void
  (e: 'drag-end'): void
}>()

const el = ref<HTMLElement | null>(null)
let enterCounter = 0

function isAtomDrag(e: DragEvent): boolean {
  if (!e.dataTransfer) return false
  const types = e.dataTransfer.types
  return (
    types.includes('application/x-atom-type') ||
    types.includes('application/x-atom-reorder')
  )
}

function calcPos(clientY: number): 'before' | 'after' {
  if (!el.value) return 'after'
  const rect = el.value.getBoundingClientRect()
  return clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

function onDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/x-atom-reorder', props.atom.id)
  e.dataTransfer.effectAllowed = 'move'
  emit('drag-start', props.atom.id)
}

function onDragEnd() {
  enterCounter = 0
  emit('drag-end')
}

function onDragEnter(e: DragEvent) {
  if (!isAtomDrag(e)) return
  enterCounter += 1
  if (enterCounter === 1) {
    emit('hint', calcPos(e.clientY))
  }
}

function onDragOver(e: DragEvent) {
  if (!isAtomDrag(e)) return
  e.preventDefault()
  if (!e.dataTransfer) return
  e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-atom-reorder')
    ? 'move'
    : 'copy'
  const pos = calcPos(e.clientY)
  if (pos !== props.hint) emit('hint', pos)
}

function onDragLeave(e: DragEvent) {
  if (!isAtomDrag(e)) return
  enterCounter -= 1
  if (enterCounter <= 0) {
    enterCounter = 0
    emit('hint', null)
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault?.()
  enterCounter = 0
  const pos = calcPos(e.clientY)
  const reorderId = e.dataTransfer?.getData('application/x-atom-reorder')
  if (reorderId) {
    if (reorderId !== props.atom.id) emit('move', reorderId, pos)
    return
  }
  const newType = e.dataTransfer?.getData('application/x-atom-type') as AtomType
  if (newType) emit('insert', newType, pos)
}
</script>

<style scoped>
.item {
  position: relative;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px 10px 8px;
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  transition: border-color 0.12s, background 0.12s, box-shadow 0.12s, opacity 0.1s;
}
.item:hover {
  border-color: #93c5fd;
}
.item.selected {
  border-color: #3b82f6;
  background: #f8fafc;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
}
.item.dragging {
  border-style: dashed;
  opacity: 0.4;
}
.item.has-error {
  border-color: #fca5a5;
  background: #fef2f2;
}
.item.has-error.selected {
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.15);
}

.handle {
  color: #cbd5e1;
  font-size: 14px;
  user-select: none;
  line-height: 1.2;
  letter-spacing: -1px;
  flex-shrink: 0;
  padding: 2px 2px 0 0;
  cursor: grab;
}
.item.dragging .handle {
  cursor: grabbing;
}

.body {
  flex: 1;
  min-width: 0;
}
/* 把 AtomInput 外层 margin 抹掉，避免卡片间距双倍 */
.body :deep(.atom-field) {
  margin-bottom: 0;
}

.del {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: #ef4444;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}
.del:hover {
  background: #dc2626;
}

.drop-line {
  height: 4px;
  background: #3b82f6;
  border-radius: 2px;
  margin: 4px 0;
  box-shadow: 0 0 6px rgba(59, 130, 246, 0.45);
  transition: all 0.08s;
}
</style>
