// 联动规则编辑器
// 给一个原子添加 / 编辑 / 删除 visible/required/disabled 规则

import { memo, useState } from 'react';
import type { FormAtom, LinkRule, LinkOp } from '@/types/formSchema';
import { OP_LABELS } from '@/lib/formRules';

type Props = {
  atom: FormAtom;
  candidateFields: FormAtom[];  // 可作为联动条件的其他原子
  onChange: (rules: LinkRule[]) => void;
};

const RULE_TYPES: LinkRule['type'][] = ['visible', 'required', 'disabled'];

const TYPE_LABELS: Record<LinkRule['type'], string> = {
  visible: '显示',
  required: '必填',
  disabled: '禁用',
};

function RuleEditor({ rule, candidateFields, onUpdate, onDelete }: {
  rule: LinkRule;
  candidateFields: FormAtom[];
  onUpdate: (r: LinkRule) => void;
  onDelete: () => void;
}) {
  const needValue = rule.when.op !== 'truthy' && rule.when.op !== 'falsy';
  const valueField = candidateFields.find((f) => f.name === rule.when.field);
  const isSelect = valueField?.type === 'select';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '60px 1fr 80px 1fr 24px',
        gap: 6,
        alignItems: 'center',
        marginBottom: 6,
        fontSize: 12,
      }}
    >
      <select
        value={rule.type}
        onChange={(e) => onUpdate({ ...rule, type: e.target.value as LinkRule['type'] })}
        style={{ padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 4 }}
      >
        {RULE_TYPES.map((t) => (
          <option key={t} value={t}>{TYPE_LABELS[t]}当</option>
        ))}
      </select>
      <select
        value={rule.when.field}
        onChange={(e) => onUpdate({ ...rule, when: { ...rule.when, field: e.target.value } })}
        style={{ padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 4 }}
      >
        <option value="">选择字段…</option>
        {candidateFields.map((f) => (
          <option key={f.id} value={f.name}>{f.label}</option>
        ))}
      </select>
      <select
        value={rule.when.op}
        onChange={(e) => onUpdate({ ...rule, when: { ...rule.when, op: e.target.value as LinkOp } })}
        style={{ padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 4 }}
      >
        {Object.entries(OP_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      {needValue ? (
        isSelect ? (
          <select
            value={String(rule.when.value ?? '')}
            onChange={(e) => onUpdate({ ...rule, when: { ...rule.when, value: e.target.value } })}
            style={{ padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 4 }}
          >
            <option value="">值…</option>
            {valueField?.options?.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input
            value={String(rule.when.value ?? '')}
            onChange={(e) => onUpdate({ ...rule, when: { ...rule.when, value: e.target.value } })}
            placeholder="值"
            style={{ padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }}
          />
        )
      ) : (
        <span />
      )}
      <button
        onClick={onDelete}
        title="删除规则"
        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
      >
        ×
      </button>
      {rule.type === 'required' && (
        <input
          value={rule.message ?? ''}
          onChange={(e) => onUpdate({ ...rule, message: e.target.value })}
          placeholder="错误提示（可选）"
          style={{
            gridColumn: '2 / span 4',
            padding: '3px 6px',
            border: '1px solid #e2e8f0',
            borderRadius: 4,
            fontSize: 11,
            color: '#64748b',
          }}
        />
      )}
    </div>
  );
}

export const RuleEditorPanel = memo(function RuleEditorPanel({
  atom,
  candidateFields,
  onChange,
}: Props) {
  const [show, setShow] = useState(atom.rules.length > 0);

  const add = () => {
    const first = candidateFields[0];
    if (!first) return;
    onChange([
      ...atom.rules,
      { type: 'visible', when: { field: first.name, op: 'eq', value: '' } },
    ]);
  };
  const update = (i: number, r: LinkRule) => {
    const next = atom.rules.slice();
    next[i] = r;
    onChange(next);
  };
  const remove = (i: number) => {
    const next = atom.rules.slice();
    next.splice(i, 1);
    onChange(next);
  };

  if (candidateFields.length === 0) {
    return (
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
        添加更多原子后才能配置联动
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8, padding: 8, background: '#f8fafc', borderRadius: 6 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>联动规则</div>
        {!show && (
          <button
            onClick={() => setShow(true)}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              border: '1px solid #cbd5e1',
              background: '#fff',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            + 添加
          </button>
        )}
      </div>
      {show && (
        <>
          {atom.rules.map((r, i) => (
            <RuleEditor
              key={i}
              rule={r}
              candidateFields={candidateFields}
              onUpdate={(nr) => update(i, nr)}
              onDelete={() => {
                remove(i);
                if (atom.rules.length === 1) setShow(false);
              }}
            />
          ))}
          <button
            onClick={add}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              border: '1px dashed #cbd5e1',
              background: '#fff',
              borderRadius: 4,
              cursor: 'pointer',
              color: '#64748b',
            }}
          >
            + 再加一条
          </button>
        </>
      )}
    </div>
  );
});
