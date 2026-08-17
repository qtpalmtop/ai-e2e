// 画布全局 store
// 设计要点：
//  1. 节点/边等大对象放在 store 而非 useState，避免任何一处变更触发整个画布重渲染
//  2. 组件用 useShallow 订阅复合切片；用原子订阅（直接返回原始值）订阅单字段
//  3. actions 在 create 时一次性定义，引用稳定 → 子组件 memo 不会被打穿
//  4. 表单 schema / 翻译器用的 CaseSchema 不进 store（每次拼接会新对象，会污染 useShallow）
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge as addRfEdge,
  type Node as FlowNode,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import { nanoid } from 'nanoid';
import type { CaseSchema, NodeType, ValidationError } from '@/types/schema';
import { NODE_LABELS } from '@/config/nodeSchemas';
import { useFormSchemaStore } from '@/store/formSchemaStore';

type CanvasState = {
  // ---------- 数据 ----------
  nodes: FlowNode[];
  edges: Edge[];
  selectedId: string | null;
  errors: ValidationError[];

  // ---------- UI ----------
  saving: boolean;
  saveHint: string | null;

  // ---------- actions（引用稳定）----------
  loadSchema: (schema: CaseSchema) => void;
  applyNodeChanges: (changes: NodeChange[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;
  connectEdge: (conn: Connection) => void;
  setSelectedId: (id: string | null) => void;
  addNode: (type: NodeType) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  setErrors: (e: ValidationError[]) => void;
  setSaving: (v: boolean) => void;
  setSaveHint: (s: string | null) => void;
};

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedId: null,
  errors: [],
  saving: false,
  saveHint: null,

  loadSchema: (schema) =>
    set({
      nodes: schema.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data as Record<string, unknown>,
      })),
      edges: schema.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
        data: e.data,
      })),
      selectedId: null,
      errors: [],
    }),

  applyNodeChanges: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),

  applyEdgeChanges: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  connectEdge: (conn) => {
    // condition 节点必须指定 sourceHandle（true/false）
    const src = get().nodes.find((n) => n.id === conn.source);
    if (src?.type === 'condition' && !conn.sourceHandle) return;
    set((s) => ({ edges: addRfEdge({ ...conn, id: nanoid() }, s.edges) }));
  },

  setSelectedId: (id) => set({ selectedId: id }),

  addNode: (type) => {
    const id = nanoid();
    // 默认值从动态表单 schema 取，没有就用空对象（用户点击节点时再设置）
    const formSchema = useFormSchemaStore.getState().schemas[type] ?? { atoms: [] };
    const data: Record<string, unknown> = { label: NODE_LABELS[type] };
    formSchema.atoms.forEach((a) => {
      if (a.defaultValue !== undefined) data[a.name] = a.defaultValue;
    });
    const position = {
      x: 100 + Math.random() * 300,
      y: 100 + Math.random() * 200,
    };
    set((s) => ({
      nodes: [...s.nodes, { id, type, position, data }],
      selectedId: id,
    }));
  },

  updateNodeData: (id, data) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...data } } : n)),
    })),

  setErrors: (errors) => set({ errors }),
  setSaving: (saving) => set({ saving }),
  setSaveHint: (saveHint) => set({ saveHint }),
}));

// ---------------- 选择器 hooks ----------------

/** 画布渲染所需的 nodes + edges + change handlers（避免任意节点 change 重渲染整页） */
export function useCanvasGraph() {
  return useCanvasStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.applyNodeChanges,
      onEdgesChange: s.applyEdgeChanges,
      onConnect: s.connectEdge,
    })),
  );
}

/** 顶部工具栏：按钮 + 校验提示 + saving 状态 */
export function useCanvasToolbar() {
  return useCanvasStore(
    useShallow((s) => ({
      errorCount: s.errors.length,
      saving: s.saving,
      saveHint: s.saveHint,
      onAddNode: s.addNode,
    })),
  );
}

/** 当前选中节点信息（空 → null）。shallow 保证只有 data 真的变了才刷新面板 */
export function useSelectedNode(): {
  id: string;
  type: string;
  data: Record<string, unknown>;
} | null {
  return useCanvasStore((s) => {
    if (!s.selectedId) return null;
    const n = s.nodes.find((x) => x.id === s.selectedId);
    if (!n) return null;
    return { id: n.id, type: n.type ?? '', data: n.data as Record<string, unknown> };
  });
}

/** 该节点关联错误（O(n) 过滤，但因为 errors 一般很小，无压力） */
export function useNodeErrors(nodeId: string | null): ValidationError[] {
  return useCanvasStore((s) =>
    nodeId ? s.errors.filter((e) => e.nodeId === nodeId) : [],
  );
}

/** 校验所需的 nodes+edges 原子读取（仅在 save/validate 主动调用） */
export const getCanvasGraph = () => {
  const s = useCanvasStore.getState();
  return { nodes: s.nodes, edges: s.edges };
};
