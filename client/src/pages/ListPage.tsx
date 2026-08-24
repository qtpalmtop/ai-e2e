// 列表页：当前空间下所有用例 + 空间切换 + 新建/删除
// 用 useSpaceStore + authStore 做空间与登录态
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cases, type CaseSummary, type SpaceRole } from '@/api';
import { useCurrentSpace, useSpaceStore } from '@/store/spaceStore';
import { useAuthStore } from '@/store/authStore';
import { SpaceMembersDialog } from '@/components/SpaceMembersDialog';

export function ListPage() {
  const me = useAuthStore((s) => s.me);
  const logout = useAuthStore((s) => s.logout);
  const current = useCurrentSpace();
  const list = useSpaceStore((s) => s.list);
  const setCurrent = useSpaceStore((s) => s.setCurrent);
  const createSpace = useSpaceStore((s) => s.create);

  const [caseList, setCaseList] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [membersOpen, setMembersOpen] = useState(false);
  const navigate = useNavigate();

  const refresh = async () => {
    if (!current) return;
    setLoading(true);
    try {
      setCaseList(await cases.list(current.id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const onCreate = async () => {
    if (!name.trim() || !current) return;
    const c = await cases.create(current.id, name.trim());
    setName('');
    setCreating(false);
    navigate(`/case/${c.id}`);
  };

  const onDelete = async (id: string) => {
    if (!confirm('确定删除该用例？')) return;
    await cases.remove(id);
    refresh();
  };

  const onCreateSpace = async () => {
    const n = newSpaceName.trim();
    if (!n) return;
    const s = await createSpace(n);
    setCurrent(s.id);
    setNewSpaceName('');
    setCreatingSpace(false);
    refresh();
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>E2E 用例列表</h1>
          <Link
            to="/forms"
            style={{ fontSize: 12, color: '#0ea5e9', textDecoration: 'none' }}
          >
            表单设计器 →
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ color: '#64748b' }}>{me?.nickname || me?.username}</span>
          <button
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
            style={btnGhost}
          >
            退出
          </button>
        </div>
      </header>

      {/* 空间选择器 */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, color: '#64748b' }}>当前空间：</span>
        <select
          value={current?.id ?? ''}
          onChange={(e) => setCurrent(e.target.value)}
          style={{
            padding: '4px 8px',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            fontSize: 13,
            background: '#fff',
          }}
        >
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.isDefault ? ' (默认)' : ''} · 角色 {roleName(s.role)}
            </option>
          ))}
        </select>
        {!creatingSpace ? (
          <button onClick={() => setCreatingSpace(true)} style={btnGhost}>
            + 新建空间
          </button>
        ) : (
          <>
            <input
              autoFocus
              placeholder="空间名"
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCreateSpace()}
              style={{
                padding: '4px 8px',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 13,
              }}
            />
            <button onClick={onCreateSpace} style={btnPrimary}>
              创建
            </button>
            <button onClick={() => setCreatingSpace(false)} style={btnGhost}>
              取消
            </button>
          </>
        )}
        {current?.isDefault && (
          <span
            style={{
              fontSize: 11,
              color: '#0ea5e9',
              background: '#e0f2fe',
              padding: '2px 8px',
              borderRadius: 999,
            }}
          >
            默认公共空间
          </span>
        )}
        {/* 只有 OWNER 才能管理成员 */}
        {current?.role === 'OWNER' && (
          <button onClick={() => setMembersOpen(true)} style={btnGhost}>
            成员管理
          </button>
        )}
      </div>

      {/* 工具条 */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            disabled={!current}
            style={{
              ...btnPrimary,
              opacity: current ? 1 : 0.5,
            }}
          >
            + 新建用例
          </button>
        ) : (
          <>
            <input
              autoFocus
              placeholder="用例名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCreate()}
              style={{
                padding: '6px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 13,
              }}
            />
            <button onClick={onCreate} style={btnPrimary}>
              创建
            </button>
            <button onClick={() => setCreating(false)} style={btnGhost}>
              取消
            </button>
          </>
        )}
      </div>

      {/* 用例表 */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>加载中…</div>
        ) : caseList.length === 0 ? (
          <div style={{ padding: 24, color: '#94a3b8', textAlign: 'center' }}>
            当前空间还没有用例
          </div>
        ) : (
          caseList.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 14px',
                borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
                fontSize: 13,
              }}
            >
              <Link
                to={`/case/${c.id}`}
                style={{ color: '#0f172a', textDecoration: 'none', flex: 1 }}
              >
                {c.name}
              </Link>
              <span style={{ color: '#94a3b8', fontSize: 11, marginRight: 12 }}>
                {new Date(c.updatedAt).toLocaleString()}
              </span>
              <button
                onClick={() => onDelete(c.id)}
                style={{
                  background: 'transparent',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  padding: '2px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                删除
              </button>
            </div>
          ))
        )}
      </div>

      {current && (
        <SpaceMembersDialog
          open={membersOpen}
          onClose={() => setMembersOpen(false)}
          spaceId={current.id}
          spaceName={current.name}
          myUserId={me?.id}
        />
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: '#0f172a',
  color: '#fff',
  border: 'none',
  padding: '6px 12px',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  background: '#fff',
  color: '#0f172a',
  border: '1px solid #cbd5e1',
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
};

function roleName(r?: SpaceRole): string {
  switch (r) {
    case 'OWNER':
      return '所有者';
    case 'EDITOR':
      return '编辑者';
    case 'VIEWER':
      return '访客';
    default:
      return '-';
  }
}
