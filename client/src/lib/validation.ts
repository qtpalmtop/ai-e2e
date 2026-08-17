import type { CaseSchema, NodeType, ValidationError } from '@/types/schema';
import { isRequired, isVisible, requiredMessage } from '@/lib/formRules';
import { useFormSchemaStore } from '@/store/formSchemaStore';

type Edge = CaseSchema['edges'][number];
type Node = CaseSchema['nodes'][number];

// 邻接表
function buildAdjacency(nodes: Node[], edges: Edge[]) {
  const out = new Map<string, Edge[]>();
  const inDeg = new Map<string, number>();
  nodes.forEach((n) => {
    out.set(n.id, []);
    inDeg.set(n.id, 0);
  });
  edges.forEach((e) => {
    if (!out.has(e.source) || !inDeg.has(e.target)) return;
    out.get(e.source)!.push(e);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  });
  return { out, inDeg };
}

// 检查有向图中是否可以从 start 到达 end
function reachableFrom(startId: string, targetId: string, out: Map<string, Edge[]>): boolean {
  const stack = [startId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === targetId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    (out.get(cur) ?? []).forEach((e) => stack.push(e.target));
  }
  return false;
}

// 找出所有无法从 start 到达的节点（孤立 / 死链）
function findUnreachable(startId: string, nodes: Node[], out: Map<string, Edge[]>): string[] {
  const seen = new Set<string>();
  const stack = [startId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    (out.get(cur) ?? []).forEach((e) => stack.push(e.target));
  }
  return nodes.filter((n) => !seen.has(n.id)).map((n) => n.id);
}

function isTerminal(type: NodeType) {
  return type === 'end';
}

function isStart(type: NodeType) {
  return type === 'start';
}

/**
 * 连通性 + 拓扑结构校验
 * 规则：
 * 1. 必须有且仅有 1 个 start 和 1 个 end 节点
 * 2. 非 start 节点必须至少有一个入边（end 除外可无入边但不可达）
 * 3. 非 end 节点必须至少有一个出边（start 除外可无出边但需能到达 end）
 * 4. 必须在 start -> end 之间存在至少一条路径
 * 5. condition 节点必须有 2 条出边（true/false 分支）
 * 6. 循环节点禁止自身回边成环
 */
export function validateConnectivity(schema: CaseSchema): ValidationError[] {
  const errors: ValidationError[] = [];
  const starts = schema.nodes.filter((n) => isStart(n.type));
  const ends = schema.nodes.filter((n) => isTerminal(n.type));

  if (starts.length === 0) errors.push({ type: 'start-end', message: '缺少开始节点' });
  if (starts.length > 1) errors.push({ type: 'start-end', message: '只允许 1 个开始节点' });
  if (ends.length === 0) errors.push({ type: 'start-end', message: '缺少结束节点' });
  if (ends.length > 1) errors.push({ type: 'start-end', message: '只允许 1 个结束节点' });
  if (errors.length) return errors;

  const { out, inDeg } = buildAdjacency(schema.nodes, schema.edges);
  const startId = starts[0].id;
  const endId = ends[0].id;

  if (!reachableFrom(startId, endId, out)) {
    errors.push({ type: 'connectivity', message: '开始节点无法到达结束节点' });
  }

  // 不可达节点
  const unreachable = findUnreachable(startId, schema.nodes, out);
  unreachable.forEach((id) => {
    const n = schema.nodes.find((x) => x.id === id)!;
    if (!isStart(n.type)) {
      errors.push({
        type: 'connectivity',
        nodeId: id,
        message: `节点「${(n.data?.label as string) ?? n.type}」无法从开始节点到达`,
      });
    }
  });

  // 出入度
  schema.nodes.forEach((n) => {
    const outs = out.get(n.id) ?? [];
    const ins = inDeg.get(n.id) ?? 0;

    if (!isStart(n.type) && ins === 0) {
      errors.push({
        type: 'connectivity',
        nodeId: n.id,
        message: `节点「${(n.data?.label as string) ?? n.type}」无入边`,
      });
    }
    if (!isTerminal(n.type) && outs.length === 0) {
      errors.push({
        type: 'connectivity',
        nodeId: n.id,
        message: `节点「${(n.data?.label as string) ?? n.type}」无出边`,
      });
    }
  });

  // condition 节点必须 2 条出边
  schema.nodes
    .filter((n) => n.type === 'condition')
    .forEach((n) => {
      const outs = out.get(n.id) ?? [];
      if (outs.length < 2) {
        errors.push({
          type: 'connectivity',
          nodeId: n.id,
          message: '条件判断节点必须连接 True / False 两个分支',
        });
      }
    });

  // 自环：loop 节点自身不能回连自己
  schema.edges.forEach((e) => {
    if (e.source === e.target) {
      errors.push({
        type: 'connectivity',
        nodeId: e.source,
        message: '禁止自环',
      });
    }
  });

  return errors;
}

/**
 * 表单字段校验：使用 formSchemaStore 里的 schema（而非旧硬编码）
 * - 校验当前可见且 required 的原子
 * - 联动规则 required-when 也会被应用
 */
export function validateForms(schema: CaseSchema): ValidationError[] {
  const errors: ValidationError[] = [];
  const schemas = useFormSchemaStore.getState().schemas;
  schema.nodes.forEach((n) => {
    const def = schemas[n.type] ?? { atoms: [] };
    const data = (n.data ?? {}) as Record<string, unknown>;
    def.atoms.forEach((atom) => {
      // 不可见的原子跳过校验
      if (!isVisible(atom, data)) return;
      const value = data[atom.name];
      // 联动 required
      const req = isRequired(atom, data);
      if (req) {
        const empty =
          value === undefined ||
          value === null ||
          value === '' ||
          (typeof value === 'string' && !(value as string).trim()) ||
          (atom.type === 'number' && Number.isNaN(value));
        if (empty) {
          const rule = atom.rules.find((r) => r.type === 'required');
          errors.push({
            type: 'form',
            nodeId: n.id,
            fieldName: atom.name,
            message: rule?.message ?? `${atom.label} 必填`,
          });
          return;
        }
      }
      // 类型内置校验（URL 格式等）
      if (atom.type === 'url' && typeof value === 'string' && value.trim()) {
        try {
          // eslint-disable-next-line no-new
          new URL(value);
        } catch {
          errors.push({
            type: 'form',
            nodeId: n.id,
            fieldName: atom.name,
            message: 'URL 格式不合法',
          });
        }
      }
      // 必填工具函数一致性检查
      const requiredErr = requiredMessage(atom, data);
      if (requiredErr) {
        errors.push({
          type: 'form',
          nodeId: n.id,
          fieldName: atom.name,
          message: requiredErr,
        });
      }
    });
  });
  return errors;
}

export function validateAll(schema: CaseSchema): ValidationError[] {
  return [...validateConnectivity(schema), ...validateForms(schema)];
}
