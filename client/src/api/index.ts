import type { CaseSchema } from '@/types/schema';
import type { FormSchema, FormSchemas } from '@/types/formSchema';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export type CaseSummary = {
  id: string;
  name: string;
  description?: string;
  updatedAt: number;
  createdAt: number;
};

export const api = {
  listCases: () => request<CaseSummary[]>('/cases'),
  getCase: (id: string) => request<CaseSchema>(`/cases/${id}`),
  createCase: (name: string) =>
    request<CaseSchema>('/cases', { method: 'POST', body: JSON.stringify({ name }) }),
  updateCase: (id: string, body: Partial<CaseSchema>) =>
    request<CaseSchema>(`/cases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteCase: (id: string) => request<{ ok: true }>(`/cases/${id}`, { method: 'DELETE' }),

  // 翻译
  translate: (id: string) =>
    request<{ ok: true; file: string }>(`/cases/${id}/translate`, { method: 'POST' }),

  // 运行
  run: (id: string) =>
    request<{ ok: boolean; logs: string; duration: number }>(`/cases/${id}/run`, {
      method: 'POST',
    }),

  // 实时预览：触发后端 live 模式运行，结果通过 WS 推送
  liveRun: (id: string) =>
    request<{ ok: true; message: string }>(`/cases/${id}/live-run`, {
      method: 'POST',
    }),

  // 表单设计器
  listFormSchemas: () => request<FormSchemas>('/form-schemas'),
  getFormSchema: (type: string) => request<FormSchema>(`/form-schemas/${type}`),
  saveFormSchema: (type: string, schema: FormSchema) =>
    request<FormSchema>(`/form-schemas/${type}`, {
      method: 'PUT',
      body: JSON.stringify(schema),
    }),
  resetFormSchemas: () =>
    request<FormSchemas>('/form-schemas/reset', { method: 'POST' }),
};
