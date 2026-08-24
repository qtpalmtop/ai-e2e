// 节点类型的中文标签 + 配色（用于画布节点显示）
// 表单 schema 已迁移到 formSchemaStore + 表单设计器，详见 @/types/formSchema

import type { NodeType } from '@/types/schema'

export const NODE_LABELS: Record<NodeType, string> = {
  start: '开始',
  end: '结束',
  openPage: '打开页面',
  inputText: '输入文字',
  clickElement: '点击元素',
  hoverElement: '悬浮元素',
  wait: '等待',
  condition: '条件判断',
  loop: '循环',
}

export const NODE_COLORS: Record<NodeType, string> = {
  start: '#10b981',
  end: '#ef4444',
  openPage: '#3b82f6',
  inputText: '#8b5cf6',
  clickElement: '#f59e0b',
  hoverElement: '#06b6d4',
  wait: '#64748b',
  condition: '#ec4899',
  loop: '#14b8a6',
}
