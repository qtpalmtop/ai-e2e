// 原子渲染器：单一组件支持 9 种原子类型
// 接收 FormAtom + 当前数据 + onChange，渲染对应的表单控件
// 渲染层不感知规则 — visible/required/disabled 由调用方计算后传入

import { memo } from 'react';
import type { FormAtom } from '@/types/formSchema';

type Props = {
  atom: FormAtom;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
};

const baseStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
};

const errStyle: React.CSSProperties = {
  ...baseStyle,
  borderColor: '#ef4444',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#334155',
  marginBottom: 4,
};

function AtomInputImpl({ atom, value, onChange, disabled, required, error }: Props) {
  const s = error ? errStyle : baseStyle;
  const v = value as never;

  let control: React.ReactNode = null;
  switch (atom.type) {
    case 'text':
    case 'url':
    case 'selector':
      control = (
        <input
          style={s}
          value={(v as string) ?? ''}
          placeholder={atom.placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'textarea':
    case 'code':
      control = (
        <textarea
          style={{ ...s, minHeight: 60, resize: 'vertical', fontFamily: atom.type === 'code' ? 'monospace' : 'inherit' }}
          value={(v as string) ?? ''}
          placeholder={atom.placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'number':
    case 'delay':
      control = (
        <input
          type="number"
          style={s}
          value={v === undefined || v === null ? '' : (v as number)}
          min={atom.min}
          max={atom.max}
          step={atom.step ?? 1}
          placeholder={atom.placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
      break;
    case 'select':
      control = (
        <select
          style={s}
          value={(v as string | number) ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>请选择…</option>
          {(atom.options ?? []).map((o) => (
            <option key={String(o.value)} value={o.value as string}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'boolean':
      control = (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={Boolean(v)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span style={{ color: '#64748b' }}>{atom.label}</span>
        </label>
      );
      break;
  }

  if (atom.type === 'boolean') {
    return (
      <div style={{ marginBottom: 12 }}>
        {control}
        {atom.help && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{atom.help}</div>}
        {error && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>
        {atom.label}
        {required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
      </label>
      {control}
      {atom.help && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{atom.help}</div>}
      {error && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export const AtomInput = memo(AtomInputImpl);
