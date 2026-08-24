import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { ListPage } from '@/pages/ListPage';
import { CanvasPage } from '@/pages/CanvasPage';
import { FormDesignerPage } from '@/pages/FormDesignerPage';
import { LoginPage } from '@/pages/LoginPage';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuthStore } from '@/store/authStore';
import { useSpaceStore } from '@/store/spaceStore';

export function App() {
  const me = useAuthStore((s) => s.me);
  const loadMe = useAuthStore((s) => s.load);
  const loadSpaces = useSpaceStore((s) => s.load);

  // 已登录则一次性拉空间列表（用于空间选择器）
  useEffect(() => {
    if (me) {
      loadSpaces().catch(() => {
        /* 静默失败，由各页面在需要时再重试 */
      });
    }
  }, [me, loadSpaces]);

  // 首屏若没触发过 loadMe，做一次（用于刷新场景）
  useEffect(() => {
    if (!me && !useAuthStore.getState().loaded) {
      loadMe();
    }
  }, [me, loadMe]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/case/:id"
          element={
            <ProtectedRoute>
              <CanvasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/forms"
          element={
            <ProtectedRoute>
              <FormDesignerPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
