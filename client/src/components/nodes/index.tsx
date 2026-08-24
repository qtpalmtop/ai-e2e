import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { NODE_COLORS, NODE_LABELS } from '@/config/nodeSchemas';
import type { NodeType } from '@/types/schema';

type FlowNodeData = {
  label?: string;
  [key: string]: unknown;
};

type AnyNode = Node<FlowNodeData, NodeType>;
type BaseProps = NodeProps<AnyNode>;

// 共享基础结构，避免每个节点重复写 Handle + Card
// 必须 memo：每个节点都引用它，xyflow 拖一个节点其它节点都会重渲父级
const NodeShell = memo(function NodeShell({
  type,
  label,
  selected,
  source = true,
  target = true,
  sourceLabel,
  showSourceLabel,
  summary,
  hasError,
}: {
  type: NodeType;
  label: string;
  selected?: boolean;
  source?: boolean;
  target?: boolean;
  sourceLabel?: string;
  showSourceLabel?: boolean;
  summary?: string;
  hasError?: boolean;
}) {
  const color = NODE_COLORS[type];
  return (
    <div
      style={{
        background: '#fff',
        border: `2px solid ${selected ? '#111' : color}`,
        borderRadius: 10,
        padding: '10px 14px',
        minWidth: 160,
        boxShadow: selected ? '0 0 0 2px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.06)',
        position: 'relative',
      }}
    >
      {target && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: color, width: 10, height: 10 }}
        />
      )}
      <div style={{ fontSize: 11, color, fontWeight: 600, letterSpacing: 0.5 }}>
        {NODE_LABELS[type].toUpperCase()}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginTop: 2 }}>
        {label}
      </div>
      {summary && (
        <div
          style={{
            fontSize: 11,
            color: '#64748b',
            marginTop: 4,
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={summary}
        >
          {summary}
        </div>
      )}
      {hasError && (
        <div
          title="存在校验错误"
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#ef4444',
            border: '2px solid #fff',
          }}
        />
      )}
      {source && (
        <Handle
          type="source"
          id="out"
          position={Position.Right}
          style={{ background: color, width: 10, height: 10 }}
        />
      )}
      {showSourceLabel && (
        <div style={{ position: 'absolute', right: -28, top: '50%', fontSize: 10, color: '#64748b' }}>
          {sourceLabel}
        </div>
      )}
    </div>
  );
});

function summaryFor(type: NodeType, data: FlowNodeData): string {
  const v = (k: string) => data?.[k];
  switch (type) {
    case 'openPage':
      return v('url') as string;
    case 'inputText':
      return `${v('selector')} → "${(v('text') as string)?.slice(0, 12)}…"`;
    case 'clickElement':
      return v('selector') as string;
    case 'hoverElement':
      return v('selector') as string;
    case 'wait':
      return `${v('duration')} ms`;
    case 'condition':
      return (v('expression') as string)?.slice(0, 24);
    case 'loop':
      return v('mode') === 'while' ? `while ${(v('whileExpression') as string)?.slice(0, 12)}` : `× ${v('count')}`;
    default:
      return '';
  }
}

function makeNode(type: NodeType, opts: Partial<Omit<Parameters<typeof NodeShell>[0], 'type' | 'label'>> = {}) {
  const Comp = (props: BaseProps) => (
    <NodeShell
      type={type}
      label={(props.data.label as string) ?? NODE_LABELS[type]}
      selected={props.selected}
      summary={summaryFor(type, props.data)}
      {...opts}
    />
  );
  Comp.displayName = `${type}Node`;
  return memo(Comp);
}

export const StartNode = makeNode('start', { source: true, target: false });
export const EndNode = makeNode('end', { source: false, target: true });

export const OpenPageNode = makeNode('openPage');
export const InputTextNode = makeNode('inputText');
export const ClickNode = makeNode('clickElement');
export const HoverNode = makeNode('hoverElement');
export const WaitNode = makeNode('wait');

// 条件节点需要 2 个 sourceHandle：true / false
export const ConditionNode = memo((props: BaseProps) => {
  const color = NODE_COLORS.condition;
  return (
    <div
      style={{
        background: '#fff',
        border: `2px solid ${props.selected ? '#111' : color}`,
        borderRadius: 10,
        padding: '10px 14px',
        minWidth: 180,
        position: 'relative',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: color, width: 10, height: 10 }}
      />
      <div style={{ fontSize: 11, color, fontWeight: 600 }}>条件判断</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
        {(props.data.label as string) ?? '条件'}
      </div>
      <div
        style={{
          fontSize: 11,
          color: '#64748b',
          marginTop: 4,
          maxWidth: 200,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={(props.data.expression as string) ?? ''}
      >
        {((props.data.expression as string) ?? '').slice(0, 28)}
      </div>
      <Handle
        type="source"
        id="true"
        position={Position.Right}
        style={{ background: '#10b981', top: '30%', width: 10, height: 10 }}
      />
      <Handle
        type="source"
        id="false"
        position={Position.Right}
        style={{ background: '#ef4444', top: '70%', width: 10, height: 10 }}
      />
      <div style={{ position: 'absolute', right: -32, top: '24%', fontSize: 10, color: '#10b981' }}>T</div>
      <div style={{ position: 'absolute', right: -32, top: '64%', fontSize: 10, color: '#ef4444' }}>F</div>
    </div>
  );
});

export const LoopNode = makeNode('loop');
