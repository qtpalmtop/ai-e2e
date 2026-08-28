import { memo, useCallback, useEffect, useRef } from 'react';
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
import { NODE_COLORS, NODE_LABELS } from '@/config/nodeSchemas';
import type { CaseSchema, NodeType, ValidationError } from '@/types/schema';
import { validateAll } from '@/lib/validation';
import {
  useCanvasStore,
  useCanvasGraph,
  useCanvasToolbar,
  useNodeCount,
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
  /** 只读模式：禁用拖拽/编辑/连线/删除（别人正在编辑时开启） */
  readOnly?: boolean;
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
const Toolbar = memo(function Toolbar({
  onRun,
  onSave,
  readOnly,
}: {
  onRun?: () => void;
  onSave: () => void;
  readOnly?: boolean;
}) {
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
            <button
              key={t}
              onClick={() => onAddNode(t)}
              disabled={readOnly}
              style={{
                ...btnStyle,
                opacity: readOnly ? 0.5 : 1,
                cursor: readOnly ? 'not-allowed' : 'pointer',
              }}
            >
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
          disabled={saving || readOnly}
          title={readOnly ? '只读模式：无法保存' : undefined}
          style={{
            ...btnStyle,
            background: '#111',
            color: '#fff',
            borderColor: '#111',
            opacity: readOnly ? 0.5 : 1,
            cursor: readOnly ? 'not-allowed' : 'pointer',
          }}
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
const Graph = memo(function Graph({ readOnly = false }: { readOnly?: boolean }) {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useCanvasGraph();
  const setSelectedId = useCanvasStore((s) => s.setSelectedId);
  const nodeCount = useNodeCount();
  const rfRef = useRef<ReactFlowInstance | null>(null);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      // 只读模式下：禁用节点/边的变更与连线
      onNodesChange={readOnly ? undefined : onNodesChange}
      onEdgesChange={readOnly ? undefined : onEdgesChange}
      onConnect={readOnly ? undefined : onConnect}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      edgesFocusable={!readOnly}
      elementsSelectable
      onNodeClick={(_, n) => setSelectedId(n.id)}
      onPaneClick={() => setSelectedId(null)}
      onInit={(inst) => (rfRef.current = inst)}
      fitView
      proOptions={{ hideAttribution: true }}
      // 性能优化：视口裁剪 — 只渲染可见区域内的节点/边，上千节点也不卡
      onlyRenderVisibleElements
      // 性能优化：选中节点不提升 z-index，避免整个节点层重绘
      elevateNodesOnSelect={false}
      // 性能优化：拖拽节点时不自动平移画布（大量节点时 autoPan 开销大）
      autoPanOnNodeDrag={false}
      autoPanOnConnect={false}
      // 性能优化：禁用双击缩放，减少误触
      zoomOnDoubleClick={false}
      // 性能优化：边不做 CSS 动画（animated 在大量边时极耗 GPU）
      defaultEdgeOptions={{ style: { stroke: '#94a3b8' } }}
    >
      <Background gap={16} />
      <Controls />
      {/* MiniMap 在节点数 ≤500 时才渲染，避免大量节点 SVG 绘制开销 */}
      {nodeCount <= 500 && (
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => NODE_COLORS[n.type as NodeType] ?? '#94a3b8'}
          nodeStrokeWidth={3}
        />
      )}
    </ReactFlow>
  );
});

function FlowCanvasInner({ initial, onSave, onRun, readOnly }: Props) {
  const loadSchema = useCanvasStore((s) => s.loadSchema);
  const setErrors = useCanvasStore((s) => s.setErrors);
  const setSaving = useCanvasStore((s) => s.setSaving);
  const setSaveHint = useCanvasStore((s) => s.setSaveHint);

  // 切换 case 时重置 store
  useEffect(() => {
    loadSchema(initial);
  }, [initial.id, loadSchema, initial]); // eslint-disable-line react-hooks/exhaustive-deps

  // 防抖校验：nodes/edges 变化后延迟 300ms 再跑 validateAll
  // 拖拽节点时每帧都会触发 nodes 引用变化，但不做全量校验，只在操作停止后校验
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  useEffect(() => {
    const timer = setTimeout(() => {
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
      setErrors(validateAll(schema));
    }, 300);
    return () => clearTimeout(timer);
  }, [nodes, edges, initial, setErrors]);

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
      <Toolbar onRun={onRun} onSave={handleSave} readOnly={readOnly} />
      <Graph readOnly={readOnly} />
      <NodeFormPanel readOnly={readOnly} />
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
