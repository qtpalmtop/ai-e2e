// 表单设计器主页面
// 3 列布局：
//   左：原子面板（按白名单过滤）
//   中：表单画布（拖入 / 排序 / 删除）
//   右：检查器（编辑选中原子的 label / required / 默认值 / 联动规则）

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { useFormSchemaStore, useFormSchema } from '@/store/formSchemaStore';
import { ATOM_LIBRARY, NODE_ATOM_WHITELIST } from '@/types/formSchema';
import type { AtomType, FormAtom, FormSchema, LinkRule, SelectOption } from '@/types/formSchema';
import type { NodeType } from '@/types/schema';
import { NODE_LABELS } from '@/config/nodeSchemas';
import { AtomInput } from '@/components/formDesigner/AtomInput';
import { RuleEditorPanel } from '@/components/formDesigner/RuleEditor';

// 节点类型列表（按业务顺序）
const NODE_TYPES: NodeType[] = [
  'openPage', 'inputText', 'clickElement', 'hoverElement', 'wait', 'condition', 'loop',
];

// ---------- 左：原子面板 ----------
const AtomPalette = memo(function AtomPalette({
  nodeType,
  onDragStart,
}: {
  nodeType: NodeType;
  onDragStart: (type: AtomType) => void;
}) {
  const whitelist = NODE_ATOM_WHITELIST[nodeType] ?? [];
  const list = ATOM_LIBRARY.filter((m) => whitelist.includes(m.type));

  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
        原子库
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
        拖到中间画布以添加
      </div>
      {list.length === 0 && (
        <div style={{ fontSize: 12, color: '#94a3b8' }}>此节点类型无允许的原子</div>
      )}
      {list.map((meta) => (
        <div
          key={meta.type}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-atom-type', meta.type);
            e.dataTransfer.effectAllowed = 'copy';
            onDragStart(meta.type);
          }}
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            padding: '8px 10px',
            marginBottom: 6,
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              background: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              color: '#475569',
            }}
          >
            {meta.icon}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{meta.label}</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{meta.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
});

// ---------- 中：画布 ----------
// 两种 drop 来源：
//   1. 调色板拖入（application/x-atom-type）→ onInsert 新建原子
//   2. 已有原子拖动（application/x-atom-reorder）→ onReorder 排序
// 插入位置判定：拖到 item 的上半部分 → 插到该 item 之前；下半部分 → 插到该 item 之后
// 占位线（蓝色 4px）渲染在 item 上方或下方；空状态时整个画布就是 drop zone
const FormCanvas = memo(function FormCanvas({
  schema,
  selectedId,
  onSelect,
  onReorder,
  onDelete,
  onAdd,
}: {
  schema: FormSchema;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (fromId: string, toIndex: number) => void;
  onDelete: (id: string) => void;
  onAdd: (type: AtomType, index: number) => void;
}) {
  // 当前插入提示：{ id, pos }，null 表示无
  const [dropHint, setDropHint] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);
  // 正在被拖动的原子 id（用于源 item 视觉变淡）
  const [draggingId, setDraggingId] = useState<string | null>(null);

  return (
    <div
      style={{ padding: 12, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}
      onDragOver={(e) => {
        // 允许 drop（preventDefault），但具体位置由子级 CanvasItem 决定
        if (
          e.dataTransfer.types.includes('application/x-atom-type') ||
          e.dataTransfer.types.includes('application/x-atom-reorder')
        ) {
          e.preventDefault();
          e.dataTransfer.dropEffect =
            e.dataTransfer.types.includes('application/x-atom-reorder') ? 'move' : 'copy';
        }
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
        表单画布
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
        拖入新原子，或拖动已有原子调整顺序；点击选中以编辑
      </div>

      {schema.atoms.length === 0 ? (
        <EmptyDropZone
          onActivate={() => setDropHint({ id: '__empty__', pos: 'after' })}
          onDeactivate={() =>
            setDropHint((c) => (c?.id === '__empty__' ? null : c))
          }
          onDrop={(type) => {
            setDropHint(null);
            onAdd(type, 0);
          }}
        />
      ) : (
        <div>
          {schema.atoms.map((atom, i) => (
            <CanvasItem
              key={atom.id}
              atom={atom}
              index={i}
              selected={selectedId === atom.id}
              isDragging={draggingId === atom.id}
              hint={dropHint?.id === atom.id ? dropHint.pos : null}
              onHintChange={(pos) => {
                if (pos === null) {
                  setDropHint((c) => (c?.id === atom.id ? null : c));
                } else {
                  setDropHint({ id: atom.id, pos });
                }
              }}
              onInsert={(type, pos) => {
                setDropHint(null);
                const insertIndex = pos === 'before' ? i : i + 1;
                onAdd(type, insertIndex);
              }}
              onMove={(fromId, pos) => {
                setDropHint(null);
                if (fromId === atom.id) return; // 拖到自己 = noop
                const insertIndex = pos === 'before' ? i : i + 1;
                onReorder(fromId, insertIndex);
              }}
              onSelect={() => onSelect(atom.id)}
              onDelete={() => onDelete(atom.id)}
              onDragStart={(id) => {
                setDraggingId(id);
                setDropHint(null);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDropHint(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// 占位线：item 上方或下方的蓝色 4px 条
function DropLine({ position }: { position: 'before' | 'after' }) {
  return (
    <div
      style={{
        height: 4,
        background: '#3b82f6',
        borderRadius: 2,
        margin: position === 'before' ? '0 0 4px' : '4px 0 0',
        boxShadow: '0 0 6px rgba(59, 130, 246, 0.45)',
        transition: 'all 0.08s',
      }}
    />
  );
}

// 空状态 DropZone：画布为空时整个区域接受 drop
function EmptyDropZone({
  onActivate,
  onDeactivate,
  onDrop,
}: {
  onActivate: () => void;
  onDeactivate: () => void;
  onDrop: (type: AtomType) => void;
}) {
  const counterRef = useRef(0);
  const activeRef = useRef(false);

  const isAtomDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes('application/x-atom-type');

  const activate = () => {
    if (activeRef.current) return;
    activeRef.current = true;
    onActivate();
  };
  const deactivate = () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    onDeactivate();
  };

  return (
    <div
      onDragEnter={(e) => {
        if (!isAtomDrag(e)) return;
        counterRef.current += 1;
        activate();
      }}
      onDragLeave={(e) => {
        if (!isAtomDrag(e)) return;
        counterRef.current -= 1;
        if (counterRef.current <= 0) {
          counterRef.current = 0;
          deactivate();
        }
      }}
      onDragOver={(e) => {
        if (isAtomDrag(e)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        counterRef.current = 0;
        activeRef.current = false;
        const t = e.dataTransfer.getData('application/x-atom-type') as AtomType;
        if (t) onDrop(t);
      }}
      style={{
        border: '2px dashed #cbd5e1',
        background: '#fff',
        borderRadius: 8,
        padding: 32,
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: 13,
      }}
    >
      从左侧拖入原子开始构建表单
    </div>
  );
}

function CanvasItem({
  atom,
  index: _index,
  selected,
  isDragging,
  hint,
  onHintChange,
  onInsert,
  onMove,
  onSelect,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  atom: FormAtom;
  index: number;
  selected: boolean;
  isDragging: boolean;
  hint: 'before' | 'after' | null;
  onHintChange: (pos: 'before' | 'after' | null) => void;
  onInsert: (type: AtomType, pos: 'before' | 'after') => void;
  onMove: (fromId: string, pos: 'before' | 'after') => void;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const counterRef = useRef(0);
  const ref = useRef<HTMLDivElement>(null);

  // 两种 drag 类型：
  //   application/x-atom-type     ← 调色板原子（drop = 新建）
  //   application/x-atom-reorder  ← 已有原子  （drop = 排序）
  const isAtomDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes('application/x-atom-type') ||
    e.dataTransfer.types.includes('application/x-atom-reorder');

  // 根据鼠标 Y 坐标判定插入位置：上半部分 → before，下半部分 → after
  const calcPos = (clientY: number): 'before' | 'after' => {
    if (!ref.current) return 'after';
    const rect = ref.current.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  };

  return (
    <>
      {hint === 'before' && <DropLine position="before" />}
      <div
        ref={ref}
        draggable
        onClick={onSelect}
        // ----- 自身作为 drag source（用于排序）-----
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-atom-reorder', atom.id);
          e.dataTransfer.effectAllowed = 'move';
          onDragStart(atom.id);
        }}
        onDragEnd={() => {
          onDragEnd();
        }}
        // ----- 自身作为 drop target（接受新原子或排序）-----
        onDragEnter={(e) => {
          if (!isAtomDrag(e)) return;
          // 拖到自己时不要显示 hint（视觉上不会触发，因为 drag 镜像不与源交互）
          if (e.dataTransfer.types.includes('application/x-atom-reorder')) {
            const fromId = e.dataTransfer.getData('application/x-atom-reorder');
            if (fromId === atom.id) return;
          }
          counterRef.current += 1;
          if (counterRef.current === 1) {
            onHintChange(calcPos(e.clientY));
          }
        }}
        onDragOver={(e) => {
          if (!isAtomDrag(e)) return;
          if (e.dataTransfer.types.includes('application/x-atom-reorder')) {
            const fromId = e.dataTransfer.getData('application/x-atom-reorder');
            if (fromId === atom.id) return;
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes(
            'application/x-atom-reorder',
          )
            ? 'move'
            : 'copy';
          // 鼠标在 item 内部移动时，实时重算上下半部分位置
          const pos = calcPos(e.clientY);
          if (pos !== hint) onHintChange(pos);
        }}
        onDragLeave={(e) => {
          if (!isAtomDrag(e)) return;
          counterRef.current -= 1;
          if (counterRef.current <= 0) {
            counterRef.current = 0;
            onHintChange(null);
          }
        }}
        onDrop={(e) => {
          counterRef.current = 0;
          const pos = calcPos(e.clientY);
          // 优先识别 reorder（已有原子排序）
          const reorderId = e.dataTransfer.getData('application/x-atom-reorder');
          if (reorderId) {
            if (reorderId !== atom.id) onMove(reorderId, pos);
            return;
          }
          // 否则识别 palette（新建原子）
          const newType = e.dataTransfer.getData('application/x-atom-type') as AtomType;
          if (newType) onInsert(newType, pos);
        }}
        style={{
          background: selected ? '#eff6ff' : '#fff',
          border: `1px ${isDragging ? 'dashed' : 'solid'} ${
            selected ? '#3b82f6' : '#e2e8f0'
          }`,
          borderRadius: 6,
          padding: 10,
          marginBottom: 4,
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          opacity: isDragging ? 0.4 : 1,
          transition: 'opacity 0.1s',
        }}
      >
        <span
          aria-hidden
          style={{
            color: '#cbd5e1',
            fontSize: 12,
            userSelect: 'none',
            lineHeight: 1,
            letterSpacing: -1,
          }}
        >
          ⋮⋮
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#0f172a' }}>
            {atom.label}
            {atom.required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>
            [{atom.type}] {atom.name}
            {atom.rules.length > 0 && ` · ${atom.rules.length} 条规则`}
          </div>
        </div>
        <Btn onClick={onDelete} title="删除" danger>×</Btn>
      </div>
      {hint === 'after' && <DropLine position="after" />}
    </>
  );
}

const Btn = ({ onClick, disabled, children, title, danger }: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
  danger?: boolean;
}) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onClick?.();
    }}
    disabled={disabled}
    title={title}
    style={{
      width: 22,
      height: 22,
      border: 'none',
      background: 'transparent',
      color: disabled ? '#cbd5e1' : danger ? '#ef4444' : '#64748b',
      cursor: disabled ? 'default' : 'pointer',
      fontSize: 14,
    }}
  >
    {children}
  </button>
);

// ---------- 右：检查器 ----------
const AtomInspector = memo(function AtomInspector({
  atom,
  candidateFields,
  onUpdate,
}: {
  atom: FormAtom;
  candidateFields: FormAtom[];
  onUpdate: (next: FormAtom) => void;
}) {
  const isSelect = atom.type === 'select';

  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
        属性
      </div>

      <Field label="类型">
        <input
          value={atom.type}
          disabled
          style={inpStyle}
        />
      </Field>

      <Field label="字段名 (name)">
        <input
          value={atom.name}
          onChange={(e) => onUpdate({ ...atom, name: e.target.value.replace(/\s+/g, '_') })}
          style={inpStyle}
        />
      </Field>

      <Field label="显示名 (label)">
        <input
          value={atom.label}
          onChange={(e) => onUpdate({ ...atom, label: e.target.value })}
          style={inpStyle}
        />
      </Field>

      <Field label="占位符">
        <input
          value={atom.placeholder ?? ''}
          onChange={(e) => onUpdate({ ...atom, placeholder: e.target.value })}
          style={inpStyle}
        />
      </Field>

      <Field label="帮助文案">
        <input
          value={atom.help ?? ''}
          onChange={(e) => onUpdate({ ...atom, help: e.target.value })}
          style={inpStyle}
        />
      </Field>

      <Field label="">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={atom.required}
            onChange={(e) => onUpdate({ ...atom, required: e.target.checked })}
          />
          默认必填
        </label>
      </Field>

      {(atom.type === 'number' || atom.type === 'delay') && (
        <>
          <Field label="最小值">
            <input
              type="number"
              value={atom.min ?? ''}
              onChange={(e) => onUpdate({ ...atom, min: e.target.value === '' ? undefined : Number(e.target.value) })}
              style={inpStyle}
            />
          </Field>
          <Field label="最大值">
            <input
              type="number"
              value={atom.max ?? ''}
              onChange={(e) => onUpdate({ ...atom, max: e.target.value === '' ? undefined : Number(e.target.value) })}
              style={inpStyle}
            />
          </Field>
        </>
      )}

      {isSelect && (
        <Field label="选项">
          <OptionEditor
            options={atom.options ?? []}
            onChange={(opts) => onUpdate({ ...atom, options: opts })}
          />
        </Field>
      )}

      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>默认值</div>
      <AtomInput
        atom={atom}
        value={atom.defaultValue}
        onChange={(v) => onUpdate({ ...atom, defaultValue: v })}
      />

      <RuleEditorPanel
        atom={atom}
        candidateFields={candidateFields.filter((f) => f.id !== atom.id)}
        onChange={(rules: LinkRule[]) => onUpdate({ ...atom, rules })}
      />
    </div>
  );
});

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 8 }}>
    {label && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{label}</div>}
    {children}
  </div>
);

const inpStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  border: '1px solid #cbd5e1',
  borderRadius: 4,
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
};

function OptionEditor({
  options,
  onChange,
}: {
  options: SelectOption[];
  onChange: (opts: SelectOption[]) => void;
}) {
  const update = (i: number, k: 'label' | 'value', v: string) => {
    const next = options.slice();
    next[i] = { ...next[i], [k]: v };
    onChange(next);
  };
  return (
    <div>
      {options.map((o, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <input
            value={o.label}
            placeholder="label"
            onChange={(e) => update(i, 'label', e.target.value)}
            style={{ ...inpStyle, flex: 1 }}
          />
          <input
            value={String(o.value)}
            placeholder="value"
            onChange={(e) => update(i, 'value', e.target.value)}
            style={{ ...inpStyle, flex: 1 }}
          />
          <Btn onClick={() => onChange(options.filter((_, j) => j !== i))} danger>×</Btn>
        </div>
      ))}
      <button
        onClick={() => onChange([...options, { label: `选项${options.length + 1}`, value: `opt${options.length + 1}` }])}
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
        + 添加选项
      </button>
    </div>
  );
}

// ---------- 预览 ----------
function LivePreview({ schema }: { schema: FormSchema }) {
  const [data, setData] = useState<Record<string, unknown>>({});
  return (
    <div style={{ padding: 12, borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>实时预览</div>
      <div style={{ background: '#fff', borderRadius: 6, padding: 8, maxHeight: 220, overflowY: 'auto' }}>
        {schema.atoms.length === 0 && (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>画布为空</div>
        )}
        {schema.atoms.map((atom) => (
          <AtomInput
            key={atom.id}
            atom={atom}
            value={data[atom.name] ?? atom.defaultValue}
            onChange={(v) => setData((d) => ({ ...d, [atom.name]: v }))}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- 主页面 ----------
export function FormDesignerPage() {
  const navigate = useNavigate();
  const fetchAll = useFormSchemaStore((s) => s.fetchAll);
  const save = useFormSchemaStore((s) => s.save);
  const reset = useFormSchemaStore((s) => s.reset);
  const fetched = useFormSchemaStore((s) => s.fetched);
  const saving = useFormSchemaStore((s) => s.saving);

  const [nodeType, setNodeType] = useState<NodeType>('openPage');
  const [draft, setDraft] = useState<FormSchema>({ atoms: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const serverSchema = useFormSchema(nodeType);

  useEffect(() => {
    if (!fetched) fetchAll();
  }, [fetched, fetchAll]);

  // 切节点类型：重置 draft
  useEffect(() => {
    setDraft({ atoms: serverSchema.atoms.map((a) => ({ ...a })) });
    setSelectedId(null);
    setDirty(false);
  }, [serverSchema, nodeType]);

  const updateDraft = useCallback((next: FormSchema) => {
    setDraft(next);
    setDirty(true);
  }, []);

  const updateAtom = useCallback((id: string, patch: Partial<FormAtom>) => {
    setDraft((d) => ({
      atoms: d.atoms.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
    setDirty(true);
  }, []);

  const addAtom = useCallback(
    (type: AtomType, index: number) => {
      const meta = ATOM_LIBRARY.find((m) => m.type === type);
      if (!meta) return;
      const id = `a-${nanoid(6)}`;
      const baseName = `${type}${draft.atoms.filter((a) => a.type === type).length + 1}`;
      const atom: FormAtom = {
        id,
        type,
        name: baseName,
        label: meta.label,
        required: false,
        rules: [],
        ...meta.defaultProps,
      };
      setDraft((d) => {
        const next = d.atoms.slice();
        next.splice(index, 0, atom);
        return { atoms: next };
      });
      setSelectedId(id);
      setDirty(true);
    },
    [draft.atoms],
  );

  const reorder = useCallback((fromId: string, toIndex: number) => {
    setDraft((d) => {
      const fromIndex = d.atoms.findIndex((a) => a.id === fromId);
      if (fromIndex < 0) return d;
      const next = d.atoms.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { atoms: next };
    });
    setDirty(true);
  }, []);

  const removeAtom = useCallback((id: string) => {
    setDraft((d) => ({ atoms: d.atoms.filter((a) => a.id !== id) }));
    setSelectedId((cur) => (cur === id ? null : cur));
    setDirty(true);
  }, []);

  const handleSave = async () => {
    try {
      await save(nodeType, draft);
      setDirty(false);
      setMsg('已保存');
      setTimeout(() => setMsg(null), 1500);
    } catch (e) {
      setMsg(`保存失败：${(e as Error).message}`);
    }
  };

  const handleReset = async () => {
    if (!confirm('重置全部节点类型的表单为默认值？')) return;
    await reset();
    setMsg('已重置为默认');
    setTimeout(() => setMsg(null), 1500);
  };

  const selectedAtom = useMemo(
    () => draft.atoms.find((a) => a.id === selectedId) ?? null,
    [draft.atoms, selectedId],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* 顶部 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 16px',
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          gap: 12,
        }}
      >
        <button
          onClick={() => navigate('/')}
          style={{
            border: '1px solid #cbd5e1',
            background: '#fff',
            padding: '4px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          ← 返回列表
        </button>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>表单设计器</div>
        <div style={{ width: 12 }} />
        <select
          value={nodeType}
          onChange={(e) => setNodeType(e.target.value as NodeType)}
          style={{
            padding: '4px 8px',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {NODE_LABELS[t]}
            </option>
          ))}
        </select>
        {dirty && <span style={{ fontSize: 11, color: '#f59e0b' }}>● 未保存</span>}
        <div style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: 12, color: '#0f172a' }}>{msg}</span>}
        <button
          onClick={handleReset}
          style={{
            border: '1px solid #cbd5e1',
            background: '#fff',
            padding: '4px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            color: '#ef4444',
          }}
        >
          重置默认
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          style={{
            border: '1px solid #111',
            background: dirty ? '#111' : '#cbd5e1',
            color: '#fff',
            padding: '4px 16px',
            borderRadius: 6,
            cursor: dirty ? 'pointer' : 'not-allowed',
            fontSize: 12,
          }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {/* 3 列 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: 240, background: '#f8fafc', borderRight: '1px solid #e2e8f0' }}>
          <AtomPalette nodeType={nodeType} onDragStart={() => {}} />
        </div>
        <div style={{ flex: 1, background: '#fff' }}>
          <FormCanvas
            schema={draft}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={reorder}
            onDelete={removeAtom}
            onAdd={addAtom}
          />
          <LivePreview schema={draft} />
        </div>
        <div style={{ width: 320, background: '#f8fafc', borderLeft: '1px solid #e2e8f0' }}>
          {selectedAtom ? (
            <AtomInspector
              atom={selectedAtom}
              candidateFields={draft.atoms}
              onUpdate={(next) => updateAtom(selectedAtom.id, next)}
            />
          ) : (
            <div style={{ padding: 16, fontSize: 12, color: '#94a3b8' }}>
              从画布选择一个原子以编辑
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
