import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type ReactFlowInstance,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useShallow } from 'zustand/react/shallow';
import {
  StartNode,
  EndNode,
  OpenPageNode,
  InputTextNode,
  ClickNode,
  HoverNode,
  WaitNode,
  ConditionNode,
  LoopNode,
} from '@/components/nodes';
import { NodeFormPanel } from '@/components/NodeFormPanel';
import { NODE_LABELS } from '@/config/nodeSchemas';
import type { CaseSchema, NodeType, ValidationError } from '@/types/schema';
import { validateAll } from '@/lib/validation';
import {
  useCanvasStore,
  useCanvasGraph,
  useCanvasToolbar,
  getCanvasGraph,
} from '@/store/canvasStore';

// 节点组件按 NodeType 注册，xyflow 通过 type 字段查找
const nodeTypes: NodeTypes = {
  start: StartNode,
  end: EndNode,
  openPage: OpenPageNode,
  inputText: InputTextNode,
  clickElement: ClickNode,
  hoverElement: HoverNode,
  wait: WaitNode,
  condition: ConditionNode,
  loop: LoopNode,
} as NodeTypes;

type Props = {
  initial: CaseSchema;
  onSave: (next: CaseSchema, errors: ValidationError[]) => Promise<void> | void;
  onRun?: () => void;
};

const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  background: '#fff',
  cursor: 'pointer',
  color: '#0f172a',
};

function graphToSchema(initial: CaseSchema): CaseSchema {
  const { nodes, edges } = getCanvasGraph();
  return {
    ...initial,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as NodeType,
      position: n.position,
      data: n.data as Record<string, unknown>,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      data: e.data as Record<string, unknown> | undefined,
    })),
  };
}

/** 顶部工具栏：只订阅 {errorCount, saving, saveHint, onAddNode}，不重渲染画布 */
const Toolbar = memo(function Toolbar({ onRun, onSave }: { onRun?: () => void; onSave: () => void }) {
  const { errorCount, saving, saveHint, onAddNode } = useCanvasToolbar();
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          zIndex: 15,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          background: 'rgba(255,255,255,0.95)',
          padding: 8,
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ fontSize: 12, color: '#64748b', marginRight: 8 }}>新增节点：</div>
        {(['openPage', 'inputText', 'clickElement', 'hoverElement', 'wait', 'condition', 'loop'] as NodeType[]).map(
          (t) => (
            <button key={t} onClick={() => onAddNode(t)} style={btnStyle}>
              + {NODE_LABELS[t]}
            </button>
          ),
        )}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: errorCount ? '#ef4444' : '#16a34a' }}>
          {errorCount ? `⚠ ${errorCount} 项校验未通过` : '✓ 校验通过'}
        </div>
        {onRun && (
          <button onClick={onRun} style={{ ...btnStyle, background: '#0ea5e9', color: '#fff', borderColor: '#0284c7' }}>
            运行
          </button>
        )}
        <button
          onClick={onSave}
          disabled={saving}
          style={{ ...btnStyle, background: '#111', color: '#fff', borderColor: '#111' }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {saveHint && (
        <div
          style={{
            position: 'absolute',
            top: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0f172a',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 12,
            zIndex: 16,
          }}
        >
          {saveHint}
        </div>
      )}
    </>
  );
});

/** 画布本体：只订阅 nodes/edges/handlers，节点拖拽不触发工具栏重渲染 */
const Graph = memo(function Graph() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useCanvasGraph();
  const setSelectedId = useCanvasStore((s) => s.setSelectedId);
  const rfRef = useRef<ReactFlowInstance | null>(null);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, n) => setSelectedId(n.id)}
      onPaneClick={() => setSelectedId(null)}
      onInit={(inst) => (rfRef.current = inst)}
      fitView
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ animated: true, style: { stroke: '#94a3b8' } }}
    >
      <Background gap={16} />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
});

function FlowCanvasInner({ initial, onSave, onRun }: Props) {
  const loadSchema = useCanvasStore((s) => s.loadSchema);
  const setErrors = useCanvasStore((s) => s.setErrors);
  const setSaving = useCanvasStore((s) => s.setSaving);
  const setSaveHint = useCanvasStore((s) => s.setSaveHint);

  // 切换 case 时重置 store
  useEffect(() => {
    loadSchema(initial);
  }, [initial.id, loadSchema, initial]); // eslint-disable-line react-hooks/exhaustive-deps

  // 实时校验：nodes/edges 变化触发
  const { nodes, edges } = useCanvasStore(
    useShallow((s) => ({ nodes: s.nodes, edges: s.edges })),
  );
  const errors = useMemo(() => {
    const schema: CaseSchema = {
      ...initial,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as NodeType,
        position: n.position,
        data: n.data as Record<string, unknown>,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
        data: e.data as Record<string, unknown> | undefined,
      })),
    };
    return validateAll(schema);
  }, [nodes, edges, initial]);
  useEffect(() => setErrors(errors), [errors, setErrors]);

  const handleSave = useCallback(async () => {
    const schema = graphToSchema(initial);
    const errs = validateAll(schema);
    setErrors(errs);
    if (errs.length) {
      setSaveHint(`保存失败：${errs.length} 项校验未通过`);
      return;
    }
    setSaving(true);
    setSaveHint(null);
    try {
      await onSave({ ...schema, updatedAt: Date.now() }, errs);
      setSaveHint('已保存');
    } catch (e) {
      setSaveHint(`保存失败：${(e as Error).message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveHint(null), 2000);
    }
  }, [initial, onSave, setErrors, setSaveHint, setSaving]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Toolbar onRun={onRun} onSave={handleSave} />
      <Graph />
      <NodeFormPanel />
    </div>
  );
}

export function FlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
