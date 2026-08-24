<!--
  原子面板（左侧）
  - 按节点类型白名单过滤 ATOM_LIBRARY
  - 每个原子卡片可拖拽到中间画布
  - 通过 dataTransfer 传递两种 mime：
      application/x-atom-type     新建
      application/x-atom-reorder  排序
-->
<template>
  <div class="palette">
    <div class="title">原子库</div>
    <div class="desc">拖到中间画布以添加</div>
    <div v-if="list.length === 0" class="empty">此节点类型无允许的原子</div>
    <div
      v-for="meta in list"
      :key="meta.type"
      class="item"
      draggable="true"
      @dragstart="onDragStart($event, meta.type)"
    >
      <div class="icon">{{ meta.icon }}</div>
      <div class="meta">
        <div class="label">{{ meta.label }}</div>
        <div class="description">{{ meta.description }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ATOM_LIBRARY, NODE_ATOM_WHITELIST } from '@/types/formSchema'
import type { AtomType } from '@/types/formSchema'
import type { NodeType } from '@/types/schema'

const props = defineProps<{
  nodeType: NodeType
}>()

const list = computed(() => {
  const whitelist = NODE_ATOM_WHITELIST[props.nodeType] ?? []
  return ATOM_LIBRARY.filter((m) => whitelist.includes(m.type))
})

function onDragStart(e: DragEvent, type: AtomType) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/x-atom-type', type)
  e.dataTransfer.effectAllowed = 'copy'
}
</script>

<style scoped>
.palette {
  padding: 12px;
  overflow-y: auto;
  height: 100%;
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
.empty {
  font-size: 12px;
  color: #94a3b8;
}
.item {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 6px;
  cursor: grab;
  display: flex;
  align-items: center;
  gap: 8px;
}
.item:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}
.item:active {
  cursor: grabbing;
}
.icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #475569;
  flex-shrink: 0;
}
.meta {
  min-width: 0;
  flex: 1;
}
.label {
  font-size: 13px;
  font-weight: 500;
  color: #0f172a;
  line-height: 1.2;
}
.description {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 2px;
  line-height: 1.2;
}
</style>
