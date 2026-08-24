// 空间成员管理弹窗（仅 OWNER 可见）
// 后端能力：POST /api/spaces/:spaceId/members（按 username 邀请 + upsert role）
//           DELETE /api/spaces/:spaceId/members/:userId（移除；不能移除自己）
// 这里把它们包装成弹窗：拉详情 → 改角色/移除/添加 → 重新拉
import { useEffect, useState } from 'react';
import { spaces, type SpaceRole, type SpaceMember } from '@/api';

type Props = {
  open: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
  myUserId?: string;
};

const ROLE_OPTIONS: { value: SpaceRole; label: string }[] = [
  { value: 'EDITOR', label: '编辑者' },
  { value: 'VIEWER', label: '访客' },
];

export function SpaceMembersDialog({ open, onClose, spaceId, spaceName, myUserId }: Props) {
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 添加表单
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<SpaceRole>('EDITOR');
  const [adding, setAdding] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await spaces.get(spaceId);
      setMembers(d.members);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      reload();
      setNewUsername('');
      setNewRole('EDITOR');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, spaceId]);

  const handleChangeRole = async (m: SpaceMember, role: SpaceRole) => {
    if (m.role === role) return;
    setError(null);
    try {
      await spaces.addMember(spaceId, m.username, role);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleRemove = async (m: SpaceMember) => {
    if (m.userId === myUserId) {
      setError('不能移除自己');
      return;
    }
    if (!confirm(`确定移除成员「${m.username}」？`)) return;
    setError(null);
    try {
      await spaces.removeMember(spaceId, m.userId);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleAdd = async () => {
    const u = newUsername.trim();
    if (!u) return;
    setAdding(true);
    setError(null);
    try {
      await spaces.addMember(spaceId, u, newRole);
      setNewUsername('');
      setNewRole('EDITOR');
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: '92vw',
          maxHeight: '85vh',
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            空间成员 · {spaceName}
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 18,
              cursor: 'pointer',
              color: '#64748b',
              lineHeight: 1,
            }}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* body */}
        <div style={{ padding: 16, overflow: 'auto' }}>
          {error && (
            <div
              style={{
                background: '#fef2f2',
                color: '#b91c1c',
                border: '1px solid #fecaca',
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            当前成员（{members.length}）
          </div>
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              overflow: 'hidden',
              marginBottom: 16,
            }}
          >
            {loading ? (
              <div style={{ padding: 16, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
                加载中…
              </div>
            ) : members.length === 0 ? (
              <div style={{ padding: 16, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
                暂无成员
              </div>
            ) : (
              members.map((m, i) => (
                <div
                  key={m.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
                    fontSize: 13,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{m.username}</div>
                    {m.nickname && (
                      <div style={{ color: '#94a3b8', fontSize: 11 }}>{m.nickname}</div>
                    )}
                  </div>
                  {m.role === 'OWNER' ? (
                    <span
                      style={{
                        fontSize: 11,
                        color: '#0ea5e9',
                        background: '#e0f2fe',
                        padding: '2px 8px',
                        borderRadius: 999,
                      }}
                    >
                      所有者
                    </span>
                  ) : (
                    <select
                      value={m.role}
                      onChange={(e) => handleChangeRole(m, e.target.value as SpaceRole)}
                      style={selectStyle}
                    >
                      <option value="EDITOR">编辑者</option>
                      <option value="VIEWER">访客</option>
                    </select>
                  )}
                  <button
                    onClick={() => handleRemove(m)}
                    disabled={m.userId === myUserId || m.role === 'OWNER'}
                    title={
                      m.userId === myUserId
                        ? '不能移除自己'
                        : m.role === 'OWNER'
                          ? '不能移除所有者'
                          : '移除'
                    }
                    style={{
                      border: '1px solid #fecaca',
                      background: '#fff',
                      color: m.userId === myUserId || m.role === 'OWNER' ? '#fca5a5' : '#dc2626',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      cursor: m.userId === myUserId || m.role === 'OWNER' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    移除
                  </button>
                </div>
              ))
            )}
          </div>

          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            添加成员（按用户名）
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="用户名"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              style={{
                flex: 1,
                padding: '6px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 13,
              }}
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as SpaceRole)}
              style={selectStyle}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={adding || !newUsername.trim()}
              style={{
                background: '#0f172a',
                color: '#fff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                cursor: adding || !newUsername.trim() ? 'not-allowed' : 'pointer',
                opacity: adding || !newUsername.trim() ? 0.5 : 1,
              }}
            >
              {adding ? '添加中…' : '添加'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
            用户名不存在时会提示错误；添加后该用户重新进入列表即可看到此空间。
          </div>
        </div>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 12,
  background: '#fff',
  cursor: 'pointer',
};
