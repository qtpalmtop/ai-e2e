// 表单设计器数据模型
// 节点表单 = 原子列表，每个原子是一个独立的可配置单元

export type AtomType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'boolean'
  | 'url'
  | 'selector'
  | 'delay'
  | 'code';

export type LinkOp = 'eq' | 'neq' | 'truthy' | 'falsy' | 'gt' | 'lt' | 'in' | 'notIn';

// 联动条件
export type Condition = {
  field: string;     // 依赖字段名
  op: LinkOp;
  value?: unknown;   // eq/neq/in/notIn 时需要
};

// 联动规则
export type LinkRule = {
  type: 'visible' | 'required' | 'disabled';
  when: Condition;
  message?: string;  // 提示文案
};

export type SelectOption = { label: string; value: string | number };

// 原子定义（用户拖到画布后保存的实例）
export type FormAtom = {
  id: string;            // 稳定 id（拖拽排序用）
  type: AtomType;        // 原子类型，决定渲染器
  name: string;          // 存储到 node.data 的字段名（同一节点内唯一）
  label: string;
  required: boolean;
  defaultValue?: unknown;
  help?: string;
  placeholder?: string;
  // type-specific
  options?: SelectOption[];  // select
  min?: number;              // number
  max?: number;              // number
  step?: number;             // number
  // 联动
  rules: LinkRule[];
};

export type FormSchema = {
  atoms: FormAtom[];
};

export type FormSchemas = Record<string, FormSchema>;

// 原子元数据（库的定义，运行时只读）
export type AtomMeta = {
  type: AtomType;
  label: string;
  description: string;
  icon: string;
  defaultProps: Partial<FormAtom>;
  // 默认校验函数（生成时注入到 FormAtom）
  validate?: (value: unknown) => string | null;
};

export const ATOM_LIBRARY: AtomMeta[] = [
  {
    type: 'text',
    label: '文本',
    description: '单行文本',
    icon: 'T',
    defaultProps: { placeholder: '' },
  },
  {
    type: 'textarea',
    label: '多行文本',
    description: '多行输入',
    icon: '¶',
    defaultProps: { placeholder: '' },
  },
  {
    type: 'number',
    label: '数字',
    description: '数字输入',
    icon: '#',
    defaultProps: {},
  },
  {
    type: 'select',
    label: '下拉选择',
    description: '从固定选项选择',
    icon: '⌄',
    defaultProps: { options: [{ label: '选项 1', value: 'opt1' }] },
  },
  {
    type: 'boolean',
    label: '开关',
    description: '布尔开关',
    icon: '◉',
    defaultProps: {},
  },
  {
    type: 'url',
    label: 'URL',
    description: '网址（自动校验格式）',
    icon: '🔗',
    defaultProps: { placeholder: 'https://...' },
    validate: (v) => {
      if (typeof v !== 'string' || !v.trim()) return 'URL 不能为空';
      try {
        // eslint-disable-next-line no-new
        new URL(v);
      } catch {
        return 'URL 格式不合法';
      }
      return null;
    },
  },
  {
    type: 'selector',
    label: '元素选择器',
    description: 'CSS / XPath 选择器',
    icon: '◎',
    defaultProps: { placeholder: '#submit' },
  },
  {
    type: 'delay',
    label: '延时 (ms)',
    description: '执行前等待',
    icon: '⏱',
    defaultProps: { min: 0, max: 60_000, step: 100 },
  },
  {
    type: 'code',
    label: '表达式',
    description: 'JS / 条件表达式',
    icon: 'λ',
    defaultProps: { placeholder: 'page.url() === "..."' },
  },
];

// 节点类型 → 允许的原子类型白名单
// 控制设计器原子面板的可见性 + 防止脏数据
export const NODE_ATOM_WHITELIST: Record<string, AtomType[]> = {
  start: [],
  end: [],
  openPage: ['url', 'delay', 'selector', 'boolean'],
  inputText: ['selector', 'text', 'textarea', 'delay'],
  clickElement: ['selector', 'delay', 'boolean'],
  hoverElement: ['selector', 'delay'],
  wait: ['delay'],
  condition: ['code', 'select'],
  loop: ['select', 'number', 'code'],
};
