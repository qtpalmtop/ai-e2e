// 表单 schema 状态
// 拉一次缓存到内存，多个组件订阅

import { create } from 'zustand';
import { api } from '@/api';
import type { FormSchema, FormSchemas } from '@/types/formSchema';

type State = {
  schemas: FormSchemas;
  loading: boolean;
  saving: boolean;
  error: string | null;
  fetched: boolean;

  fetchAll: () => Promise<void>;
  save: (type: string, schema: FormSchema) => Promise<void>;
  reset: () => Promise<void>;
  getLocal: (type: string) => FormSchema;
};

const EMPTY: FormSchema = { atoms: [] };

export const useFormSchemaStore = create<State>((set, get) => ({
  schemas: {},
  loading: false,
  saving: false,
  error: null,
  fetched: false,

  fetchAll: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const all = await api.listFormSchemas();
      set({ schemas: all, loading: false, fetched: true });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  save: async (type, schema) => {
    set({ saving: true, error: null });
    try {
      const saved = await api.saveFormSchema(type, schema);
      set((s) => ({ schemas: { ...s.schemas, [type]: saved }, saving: false }));
    } catch (e) {
      set({ error: (e as Error).message, saving: false });
      throw e;
    }
  },

  reset: async () => {
    set({ saving: true, error: null });
    try {
      const all = await api.resetFormSchemas();
      set({ schemas: all, saving: false });
    } catch (e) {
      set({ error: (e as Error).message, saving: false });
      throw e;
    }
  },

  getLocal: (type) => get().schemas[type] ?? EMPTY,
}));

export const useFormSchema = (type: string) =>
  useFormSchemaStore((s) => s.schemas[type] ?? EMPTY);
