<!--
  画布单项（FormCanvas 内部用）
  - 自身作为 drag source：把 atom.id 写到 application/x-atom-reorder
  - 自身作为 drop target：根据鼠标 Y 坐标判定插入位置 (before / after)
  - 父组件根据 hint 渲染占位线
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
      <span class="handle" aria-hidden>⋮⋮</span>
      <div class="body">
        <div class="atom-label">
          {{ atom.label }}
          <span v-if="atom.required" class="required-mark">*</span>
        </div>
        <div class="atom-meta">
          [{{ atom.type }}] {{ atom.name }}
          <span v-if="atom.rules.length > 0"> · {{ atom.rules.length }} 条规则</span>
        </div>
      </div>
      <button
        class="del"
        title="删除"
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

const props = defineProps<{
  atom: FormAtom
  selected: boolean
  hint: 'before' | 'after' | null
  isDragging: boolean
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
  // 优先识别 reorder
  const reorderId = e.dataTransfer?.getData('application/x-atom-reorder')
  if (reorderId) {
    if (reorderId !== props.atom.id) emit('move', reorderId, pos)
    return
  }
  // 否则识别 palette
  const newType = e.dataTransfer?.getData('application/x-atom-type') as AtomType
  if (newType) emit('insert', newType, pos)
}
</script>

<style scoped>
.item {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 4px;
  cursor: grab;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: opacity 0.1s, border-color 0.12s, background 0.12s;
}
.item.selected {
  background: #eff6ff;
  border-color: #3b82f6;
}
.item.dragging {
  border-style: dashed;
  opacity: 0.4;
  cursor: grabbing;
}
.handle {
  color: #cbd5e1;
  font-size: 12px;
  user-select: none;
  line-height: 1;
  letter-spacing: -1px;
  flex-shrink: 0;
}
.body {
  flex: 1;
  min-width: 0;
}
.atom-label {
  font-size: 12px;
  font-weight: 500;
  color: #0f172a;
  line-height: 1.2;
}
.required-mark {
  color: #ef4444;
  margin-left: 4px;
}
.atom-meta {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 2px;
  line-height: 1.2;
}
.del {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
  font-size: 14px;
  flex-shrink: 0;
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
