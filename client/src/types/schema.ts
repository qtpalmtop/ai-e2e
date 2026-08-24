// 用例编排核心类型，前后端共享
// nodeType 决定节点渲染 + 表单 schema + 翻译器输出

export type NodeType =
  | 'start'
  | 'end'
  | 'openPage'
  | 'inputText'
  | 'clickElement'
  | 'hoverElement'
  | 'wait'
  | 'condition'
  | 'loop';

export type FieldType = 'string' | 'number' | 'select' | 'textarea' | 'boolean';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string | number }>;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  /** 简单校验函数返回错误信息，null 表示通过。第二个参数是表单整体值，用于跨字段校验 */
  validate?: (value: unknown, all?: Record<string, unknown>) => string | null;
  /** 提示信息 */
  help?: string;
}

export interface NodeFormSchema {
  fields: FieldDef[];
}

// 节点 data 由各节点类型扩展
export interface BaseNodeData {
  label: string;
  [key: string]: unknown;
}

export type CaseSchema = {
  id: string;
  name: string;
  description?: string;
  /** xyflow 标准格式：nodes + edges */
  nodes: Array<{
    id: string;
    type: NodeType;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    data?: Record<string, unknown>;
  }>;
  updatedAt: number;
  createdAt: number;
};

export type ValidationError = {
  type: 'connectivity' | 'form' | 'start-end';
  nodeId?: string;
  /** 表单错误关联的原子 name，配合 nodeId 唯一定位到表单项 */
  fieldName?: string;
  message: string;
};
