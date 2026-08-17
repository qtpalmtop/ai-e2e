import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ListPage } from '@/pages/ListPage';
import { CanvasPage } from '@/pages/CanvasPage';
import { FormDesignerPage } from '@/pages/FormDesignerPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ListPage />} />
        <Route path="/case/:id" element={<CanvasPage />} />
        <Route path="/forms" element={<FormDesignerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
