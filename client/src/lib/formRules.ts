// 表单 schema 规则求值
// 规则：{ type: 'visible' | 'required' | 'disabled', when: Condition }

import type { Condition, FormAtom, LinkOp } from '@/types/formSchema';

export function evalCondition(cond: Condition, data: Record<string, unknown>): boolean {
  const v = data[cond.field];
  switch (cond.op) {
    case 'truthy':
      return Boolean(v);
    case 'falsy':
      return !v;
    case 'eq':
      return v === cond.value;
    case 'neq':
      return v !== cond.value;
    case 'gt': {
      const a = Number(v);
      const b = Number(cond.value);
      return Number.isFinite(a) && Number.isFinite(b) && a > b;
    }
    case 'lt': {
      const a = Number(v);
      const b = Number(cond.value);
      return Number.isFinite(a) && Number.isFinite(b) && a < b;
    }
    case 'in':
      return Array.isArray(cond.value) && cond.value.includes(v as never);
    case 'notIn':
      return Array.isArray(cond.value) && !cond.value.includes(v as never);
    default:
      return true;
  }
}

export function isVisible(atom: FormAtom, data: Record<string, unknown>): boolean {
  const rule = atom.rules.find((r) => r.type === 'visible');
  if (!rule) return true;
  return evalCondition(rule.when, data);
}

export function isRequired(atom: FormAtom, data: Record<string, unknown>): boolean {
  const rule = atom.rules.find((r) => r.type === 'required');
  if (rule) {
    return evalCondition(rule.when, data);
  }
  return atom.required;
}

export function isDisabled(atom: FormAtom, data: Record<string, unknown>): boolean {
  const rule = atom.rules.find((r) => r.type === 'disabled');
  if (!rule) return false;
  return evalCondition(rule.when, data);
}

export function requiredMessage(atom: FormAtom, data: Record<string, unknown>): string | null {
  if (!isRequired(atom, data)) return null;
  const empty =
    atom.required &&
    (data[atom.name] === undefined ||
      data[atom.name] === null ||
      data[atom.name] === '' ||
      (typeof data[atom.name] === 'string' && !(data[atom.name] as string).trim()));
  if (!empty) return null;
  const rule = atom.rules.find((r) => r.type === 'required');
  return rule?.message ?? `${atom.label}不能为空`;
}

export const OP_LABELS: Record<LinkOp, string> = {
  eq: '等于',
  neq: '不等于',
  truthy: '为真',
  falsy: '为假',
  gt: '大于',
  lt: '小于',
  in: '属于',
  notIn: '不属于',
};
