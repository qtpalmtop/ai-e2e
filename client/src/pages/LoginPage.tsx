// 登录页：极简版 — 用户名 / 密码 / 注册 / 登录
// 注册接口默认会绑定到 common 空间，无需选空间
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password, nickname.trim() || undefined);
      }
      navigate('/', { replace: true });
    } catch (e: any) {
      setError(e?.message ?? '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f1f5f9',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: 360,
          background: '#fff',
          padding: 28,
          borderRadius: 12,
          boxShadow: '0 6px 24px rgba(15,23,42,0.08)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>
          E2E Orchestrator
        </h1>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18, marginTop: 4 }}>
          {mode === 'login' ? '登录后继续' : '注册账号（自动加入公共空间）'}
        </div>

        <Field label="用户名">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            minLength={3}
            style={inputStyle}
          />
        </Field>
        <Field label="密码">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={inputStyle}
          />
        </Field>
        {mode === 'register' && (
          <Field label="昵称（可选）">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              style={inputStyle}
            />
          </Field>
        )}

        {error && (
          <div
            style={{
              color: '#dc2626',
              background: '#fef2f2',
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

        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%',
            padding: '10px 0',
            background: busy ? '#94a3b8' : '#0f172a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? '处理中…' : mode === 'login' ? '登录' : '注册'}
        </button>

        <div style={{ marginTop: 12, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
          {mode === 'login' ? (
            <>
              还没有账号？{' '}
              <a
                onClick={() => setMode('register')}
                style={{ color: '#0ea5e9', cursor: 'pointer' }}
              >
                立即注册
              </a>
            </>
          ) : (
            <>
              已有账号？{' '}
              <a
                onClick={() => setMode('login')}
                style={{ color: '#0ea5e9', cursor: 'pointer' }}
              >
                返回登录
              </a>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}
