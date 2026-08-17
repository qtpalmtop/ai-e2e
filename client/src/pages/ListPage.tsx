import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type CaseSummary } from '@/api';

export function ListPage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const navigate = useNavigate();

  const refresh = async () => {
    setLoading(true);
    try {
      setCases(await api.listCases());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const onCreate = async () => {
    if (!name.trim()) return;
    const c = await api.createCase(name.trim());
    setName('');
    setCreating(false);
    navigate(`/case/${c.id}`);
  };

  const onDelete = async (id: string) => {
    if (!confirm('确定删除该用例？')) return;
    await api.deleteCase(id);
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
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>E2E 用例列表</h1>
          <Link
            to="/forms"
            style={{
              fontSize: 12,
              color: '#0ea5e9',
              textDecoration: 'none',
              padding: '4px 10px',
              border: '1px solid #7dd3fc',
              borderRadius: 6,
            }}
          >
            ⚙ 表单设计
          </Link>
        </div>
        <button
          onClick={() => setCreating(true)}
          style={{
            background: '#111',
            color: '#fff',
            border: 'none',
            padding: '8px 14px',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          + 新建用例
        </button>
      </header>

      {creating && (
        <div
          style={{
            background: '#f1f5f9',
            padding: 12,
            borderRadius: 8,
            marginBottom: 12,
            display: 'flex',
            gap: 8,
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="用例名称，例如 登录流程"
            style={{
              flex: 1,
              padding: '6px 10px',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              fontSize: 14,
            }}
            onKeyDown={(e) => e.key === 'Enter' && onCreate()}
          />
          <button onClick={onCreate} style={primaryBtn}>
            创建
          </button>
          <button onClick={() => setCreating(false)} style={ghostBtn}>
            取消
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ color: '#64748b', padding: 24 }}>加载中...</div>
      ) : cases.length === 0 ? (
        <Empty />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {cases.map((c) => (
            <li
              key={c.id}
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '14px 16px',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <Link
                  to={`/case/${c.id}`}
                  style={{ color: '#0f172a', textDecoration: 'none', fontSize: 16, fontWeight: 600 }}
                >
                  {c.name}
                </Link>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  更新于 {new Date(c.updatedAt).toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link
                  to={`/case/${c.id}`}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    textDecoration: 'none',
                    color: '#0f172a',
                  }}
                >
                  编辑
                </Link>
                <button
                  onClick={() => onDelete(c.id)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    border: '1px solid #fecaca',
                    background: '#fff',
                    color: '#dc2626',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 60,
        color: '#94a3b8',
        background: '#f8fafc',
        borderRadius: 8,
        border: '1px dashed #cbd5e1',
      }}
    >
      暂无用例，点击「+ 新建用例」开始编排
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  border: 'none',
  padding: '6px 14px',
  borderRadius: 6,
  cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  background: '#fff',
  color: '#0f172a',
  border: '1px solid #cbd5e1',
  padding: '6px 14px',
  borderRadius: 6,
  cursor: 'pointer',
};
