import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { NODE_LABELS } from '@/config/nodeSchemas';
import { useCanvasStore, useSelectedNode, useNodeErrors } from '@/store/canvasStore';
import { useFormSchemaStore, useFormSchema } from '@/store/formSchemaStore';
import { isVisible, isRequired, isDisabled, requiredMessage } from '@/lib/formRules';
import { AtomInput } from '@/components/formDesigner/AtomInput';

export const NodeFormPanel = memo(function NodeFormPanel({ readOnly }: { readOnly?: boolean } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const selected = useSelectedNode();
  const nodeErrors = useNodeErrors(selectedId);
  const setSelectedId = useCanvasStore((s) => s.setSelectedId);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const fetchAllFormSchemas = useFormSchemaStore((s) => s.fetchAll);
  const fetched = useFormSchemaStore((s) => s.fetched);

  const nodeType = selected?.type ?? null;
  const formSchema = useFormSchema(nodeType ?? '__');

  const [draft, setDraft] = useState<Record<string, unknown>>({});

  // 进入页面：拉一次表单 schema
  useEffect(() => {
    if (!fetched) fetchAllFormSchemas();
  }, [fetched, fetchAllFormSchemas]);

  // 切换节点 → 同步 draft
  useEffect(() => {
    if (selected) setDraft({ ...selected.data });
  }, [selected?.id, selected?.data]);

  // 当前可见的原子
  const visibleAtoms = useMemo(() => {
    if (!nodeType) return [];
    return formSchema.atoms.filter((a) => isVisible(a, draft));
  }, [formSchema, draft, nodeType]);

  // 点击外部关闭
  useEffect(() => {
    if (!selectedId) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      const target = e.target as unknown;
      if (!(target instanceof globalThis.Node) || !ref.current.contains(target)) {
        setSelectedId(null);
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
    };
  }, [selectedId, setSelectedId]);

  if (!selectedId || !selected || !nodeType) return null;

  const commit = (next: Record<string, unknown>) => {
    if (readOnly) return;
    setDraft(next);
    updateNodeData(selected.id, next);
  };

  const updateField = (k: string, v: unknown) => {
    commit({ ...draft, [k]: v });
  };

  return (
    <aside
      ref={ref}
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 320,
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
        padding: 16,
        zIndex: 20,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>节点配置</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
            {NODE_LABELS[nodeType as keyof typeof NODE_LABELS]}
          </div>
        </div>
        <button
          aria-label="关闭"
          onClick={() => setSelectedId(null)}
          style={{
            border: 'none',
            background: 'transparent',
            fontSize: 20,
            cursor: 'pointer',
            color: '#94a3b8',
          }}
        >
          ×
        </button>
      </div>

      {/* 节点名称始终可编辑（label 是节点的"显示名"，非原子） */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, color: '#334155', marginBottom: 4 }}>
          节点名称<span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>
        </label>
        <input
          disabled={!!readOnly}
          style={{
            width: '100%',
            padding: '6px 8px',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
            background: readOnly ? '#f1f5f9' : '#fff',
            color: readOnly ? '#94a3b8' : '#0f172a',
            cursor: readOnly ? 'not-allowed' : 'text',
          }}
          value={(draft.label as string) ?? ''}
          onChange={(e) => updateField('label', e.target.value)}
        />
      </div>

      {visibleAtoms.length === 0 && (
        <div style={{ fontSize: 12, color: '#64748b', padding: '12px 0' }}>
          此节点无需配置。可在「表单设计」中为此节点类型添加表单原子。
        </div>
      )}

      {visibleAtoms.map((atom) => {
        const err = nodeErrors.find((e) => e.fieldName === atom.name)?.message
          ?? requiredMessage(atom, draft)
          ?? undefined;
        return (
          <AtomInput
            key={atom.id}
            atom={atom}
            value={draft[atom.name]}
            onChange={(v) => updateField(atom.name, v)}
            disabled={isDisabled(atom, draft) || !!readOnly}
            required={isRequired(atom, draft)}
            error={err}
          />
        );
      })}

      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
        {readOnly
          ? '只读模式：当前用例正在被其他用户编辑，修改不会保存'
          : '修改实时保存到画布；点击面板外关闭'}
      </div>
    </aside>
  );
});
