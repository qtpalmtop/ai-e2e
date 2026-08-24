// 画布 store
// 设计要点：
//  1. 节点/边等大对象放在 store 而非组件 ref，避免任何一处变更触发整个画布重渲染
//  2. 组件用 storeToRefs 订阅复合切片；用原子订阅（直接返回原始值）订阅单字段
//  3. actions 直接返回，引用稳定
//  4. 表单 schema / 翻译器用的 CaseSchema 不进 store（每次拼接会新对象）
import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  applyNodeChanges as vfApplyNodeChanges,
  applyEdgeChanges as vfApplyEdgeChanges,
  addEdge as vfAddEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@vue-flow/core'
import { nanoid } from 'nanoid'
import type { CaseSchema, NodeType, ValidationError } from '@/types/schema'
import { NODE_LABELS } from '@/config/nodeSchemas'
import { useFormSchemaStore } from '@/stores/formSchema'
import { useSpaceStore } from '@/stores/space'

// 不直接复用 @vue-flow/core 的 Node/Edge：它们的泛型在 TS 里实例化深度爆炸
// 这里用最小自给类型，结构上与 vue-flow 的 Node/Edge 兼容
type FlowNode = {
  id: string
  type?: string
  position: { x: number; y: number }
  data: Record<string, unknown>
  [key: string]: unknown
}
type FlowEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  data?: Record<string, unknown>
  [key: string]: unknown
}

export const useCanvasStore = defineStore('canvas', () => {
  // ---------- 数据 ----------
  const nodes = ref<FlowNode[]>([])
  const edges = ref<FlowEdge[]>([])
  const selectedId = ref<string | null>(null)
  const errors = ref<ValidationError[]>([])

  // ---------- UI ----------
  const saving = ref(false)
  const saveHint = ref<string | null>(null)

  // ---------- actions ----------
  function loadSchema(schema: CaseSchema) {
    nodes.value = schema.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data as Record<string, unknown>,
    }))
    edges.value = schema.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      data: e.data,
    }))
    selectedId.value = null
    errors.value = []
  }

  function applyNodeChangesAction(changes: NodeChange[]) {
    // vue-flow 的工具类型期望 GraphNode（包含 computedPosition 等运行时字段），
    // 我们这里只存 Node，使用类型断言把已有节点视作 GraphNode 传入
    nodes.value = vfApplyNodeChanges(changes, nodes.value as never) as unknown as FlowNode[]
  }

  function applyEdgeChangesAction(changes: EdgeChange[]) {
    edges.value = vfApplyEdgeChanges(changes, edges.value as never) as unknown as FlowEdge[]
  }

  function connectEdge(conn: Connection) {
    // condition 节点必须指定 sourceHandle（true/false）
    const src = nodes.value.find((n) => n.id === conn.source)
    if (src?.type === 'condition' && !conn.sourceHandle) return
    edges.value = vfAddEdge({ ...conn, id: nanoid() }, edges.value as never) as unknown as FlowEdge[]
  }

  function setSelectedId(id: string | null) {
    selectedId.value = id
  }

  function addNode(type: NodeType) {
    const id = nanoid()
    // 默认值从动态表单 schema 取，没有就用空对象
    const spaceStore = useSpaceStore()
    const formSchemaStore = useFormSchemaStore()
    const spaceId = spaceStore.currentId
    const formSchema: { atoms: Array<{ name: string; defaultValue?: unknown }> } = spaceId
      ? (formSchemaStore.getLocalFor(spaceId, type) as any)
      : { atoms: [] }
    const data: Record<string, unknown> = { label: NODE_LABELS[type] }
    formSchema.atoms.forEach((a) => {
      if (a.defaultValue !== undefined) data[a.name] = a.defaultValue
    })
    const position = {
      x: 100 + Math.random() * 300,
      y: 100 + Math.random() * 200,
    }
    nodes.value = [...nodes.value, { id, type, position, data }]
    selectedId.value = id
  }

  function updateNodeData(id: string, data: Record<string, unknown>) {
    nodes.value = nodes.value.map((n) =>
      n.id === id ? { ...n, data: { ...data } } : n,
    )
  }

  function setErrors(e: ValidationError[]) {
    errors.value = e
  }

  function setSaving(v: boolean) {
    saving.value = v
  }

  function setSaveHint(s: string | null) {
    saveHint.value = s
  }

  return {
    // state
    nodes,
    edges,
    selectedId,
    errors,
    saving,
    saveHint,
    // actions
    loadSchema,
    applyNodeChanges: applyNodeChangesAction,
    applyEdgeChanges: applyEdgeChangesAction,
    connectEdge,
    setSelectedId,
    addNode,
    updateNodeData,
    setErrors,
    setSaving,
    setSaveHint,
  }
})
