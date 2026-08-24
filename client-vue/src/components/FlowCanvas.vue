<!--
  画布：
  - 顶部工具栏：新增节点 + 校验提示 + 运行/保存
  - 画布本体：<VueFlow> 绑定 nodes/edges 与 handlers
  - 节点配置面板：<NodeFormPanel>
  - 保存/校验/实时错误与 React 版一致
-->
<template>
  <div class="canvas-wrap">
    <!-- 工具栏：只订阅 saving / saveHint / errors.length / addNode，不订阅 nodes/edges -->
    <div class="toolbar">
      <span class="bar-label">新增节点：</span>
      <button
        v-for="t in ADDABLE_TYPES"
        :key="t"
        class="btn btn-ghost"
        :disabled="readOnly"
        @click="canvas.addNode(t)"
      >
        + {{ NODE_LABELS[t] }}
      </button>
      <div class="spacer" />
      <span :class="['status', errorCount ? 'status-err' : 'status-ok']">
        {{ errorCount ? `⚠ ${errorCount} 项校验未通过` : '✓ 校验通过' }}
      </span>
      <button
        v-if="onRun"
        class="btn btn-primary"
        :style="{ background: '#0ea5e9', borderColor: '#0284c7' }"
        @click="onRun"
      >
        运行
      </button>
      <button
        class="btn btn-primary"
        :disabled="canvas.saving || readOnly"
        :title="readOnly ? '只读模式：无法保存' : undefined"
        @click="handleSave"
      >
        {{ canvas.saving ? '保存中…' : '保存' }}
      </button>
    </div>

    <transition name="fade">
      <div v-if="canvas.saveHint" class="save-hint">{{ canvas.saveHint }}</div>
    </transition>

    <!-- 画布本体 -->
    <div class="flow">
      <VueFlow
        :nodes="canvas.nodes"
        :edges="canvas.edges"
        :node-types="nodeTypes"
        :nodes-draggable="!readOnly"
        :nodes-connectable="!readOnly"
        :edges-focusable="!readOnly"
        :default-edge-options="{ animated: true, style: { stroke: '#94a3b8' } }"
        :fit-view-on-init="true"
        :pro-options="{ hideAttribution: true }"
        @nodes-change="readOnly ? undefined : onNodesChange"
        @edges-change="readOnly ? undefined : onEdgesChange"
        @connect="onConnect"
        @node-click="onNodeClick"
        @pane-click="onPaneClick"
      >
        <Background :gap="16" />
        <Controls />
        <MiniMap pannable zoomable />
      </VueFlow>
    </div>

    <NodeFormPanel :read-only="readOnly" />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import {
  VueFlow,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeTypesObject,
} from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import { nodeTypes as nodeTypeMap } from '@/components/nodes'
import NodeFormPanel from '@/components/NodeFormPanel.vue'
import { NODE_LABELS } from '@/config/nodeSchemas'
import { useCanvasStore } from '@/stores/canvas'
import { validateAll } from '@/lib/validation'
import type { CaseSchema, NodeType, ValidationError } from '@/types/schema'

const props = defineProps<{
  initial: CaseSchema
  onSave: (next: CaseSchema, errors: ValidationError[]) => Promise<void> | void
  onRun?: () => void
  readOnly?: boolean
}>()

const canvas = useCanvasStore()

const ADDABLE_TYPES: NodeType[] = [
  'openPage',
  'inputText',
  'clickElement',
  'hoverElement',
  'wait',
  'condition',
  'loop',
]

// nodeTypes 是我们自己 .vue 组件组成的对象；vue-flow 期望 NodeComponent。
// 我们的节点组件 props 与 NodeProps 兼容（id/type/data/selected/...），
// 这里用类型断言规避 vue-flow 对组件签名的小差异（dragHandle 等扩展字段我们不读）
const nodeTypes = nodeTypeMap as unknown as NodeTypesObject

const errorCount = computed(() => canvas.errors.length)

// 切换 case → 重置 store
watch(
  () => props.initial.id,
  () => canvas.loadSchema(props.initial),
  { immediate: true },
)

// 实时校验：nodes/edges 变化时计算 errors
watch(
  () => [canvas.nodes, canvas.edges],
  () => {
    const schema = graphToSchema()
    canvas.setErrors(validateAll(schema))
  },
  { deep: true, immediate: true },
)

function graphToSchema(): CaseSchema {
  return {
    ...props.initial,
    nodes: canvas.nodes.map((n) => ({
      id: n.id,
      type: n.type as NodeType,
      position: { x: n.position.x, y: n.position.y },
      data: n.data as Record<string, unknown>,
    })),
    edges: canvas.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      data: e.data as Record<string, unknown> | undefined,
    })),
  }
}

function onNodesChange(changes: NodeChange[]) {
  if (props.readOnly) return
  canvas.applyNodeChanges(changes)
}
function onEdgesChange(changes: EdgeChange[]) {
  if (props.readOnly) return
  canvas.applyEdgeChanges(changes)
}
function onConnect(conn: Connection) {
  if (props.readOnly) return
  canvas.connectEdge(conn)
}
function onNodeClick({ node }: { node: { id: string } }) {
  canvas.setSelectedId(node.id)
}
function onPaneClick() {
  canvas.setSelectedId(null)
}

async function handleSave() {
  const schema = graphToSchema()
  const errs = validateAll(schema)
  canvas.setErrors(errs)
  if (errs.length) {
    canvas.setSaveHint(`保存失败：${errs.length} 项校验未通过`)
    return
  }
  canvas.setSaving(true)
  canvas.setSaveHint(null)
  try {
    await props.onSave({ ...schema, updatedAt: Date.now() }, errs)
    canvas.setSaveHint('已保存')
  } catch (e: any) {
    canvas.setSaveHint(`保存失败：${e?.message ?? '未知错误'}`)
  } finally {
    canvas.setSaving(false)
    setTimeout(() => canvas.setSaveHint(null), 2000)
  }
}
</script>

<style scoped>
.canvas-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}
.toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  background: rgba(255, 255, 255, 0.95);
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.bar-label {
  font-size: 12px;
  color: #64748b;
  margin-right: 8px;
}
.btn {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  color: #0f172a;
}
.btn:hover:not(:disabled) {
  border-color: #94a3b8;
}
.btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.btn-primary {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}
.btn-ghost {
  background: #fff;
}
.spacer {
  flex: 1;
}
.status {
  font-size: 12px;
}
.status-ok {
  color: #16a34a;
}
.status-err {
  color: #ef4444;
}
.save-hint {
  position: absolute;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  background: #0f172a;
  color: #fff;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  z-index: 16;
}
.flow {
  width: 100%;
  height: 100%;
}

/* vue-flow Controls 的 SVG path 没有 fill，需显式上色才能看到图标 */
:deep(.vue-flow__controls-button) {
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: none;
}
:deep(.vue-flow__controls-button:hover) {
  background: #f8fafc;
}
:deep(.vue-flow__controls-button svg) {
  fill: #0f172a;
  max-width: 14px;
  max-height: 14px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
