// 路由守卫：未登录 → /login
// 用法：<ProtectedRoute><CanvasPage /></ProtectedRoute>
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { me, loaded, load } = useAuthStore();
  const [pending, setPending] = useState(!loaded);
  const location = useLocation();

  useEffect(() => {
    if (!loaded) {
      load().finally(() => setPending(false));
    } else {
      setPending(false);
    }
  }, [loaded, load]);

  if (pending) {
    return (
      <div style={{ padding: 24, color: '#64748b' }}>正在校验登录态…</div>
    );
  }
  if (!me) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
