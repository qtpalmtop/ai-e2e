// 表单 schema 状态
// 拉一次缓存到内存，多个组件订阅
// 改造点：所有请求都自动带上"当前 spaceId"（从 useSpaceStore 读取）
import { create } from 'zustand';
import { formSchemas as formSchemasApi } from '@/api';
import type { FormSchema, FormSchemas } from '@/types/formSchema';
import { useSpaceStore } from './spaceStore';

type State = {
  bySpace: Record<string, FormSchemas>;
  // 当前空间是否已加载（兼容老 API）
  fetched: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  activeSpaceId: string | null;

  // 无参接口：内部从 spaceStore 拿当前空间
  fetchAll: () => Promise<void>;
  save: (type: string, schema: FormSchema) => Promise<void>;
  reset: () => Promise<void>;
  getLocal: (type: string) => FormSchema;
  // 显式带 spaceId 的接口（供非 React 上下文使用，例如 canvasStore）
  fetchAllFor: (spaceId: string) => Promise<void>;
  getLocalFor: (spaceId: string, type: string) => FormSchema;
};

const EMPTY: FormSchema = { atoms: [] };

function currentSpaceIdOrNull(): string | null {
  return useSpaceStore.getState().currentId;
}

export const useFormSchemaStore = create<State>((set, get) => ({
  bySpace: {},
  fetched: false,
  loading: false,
  saving: false,
  error: null,
  activeSpaceId: null,

  fetchAll: async () => {
    const spaceId = currentSpaceIdOrNull();
    if (!spaceId) return;
    if (get().loading) return;
    set({ loading: true, error: null, activeSpaceId: spaceId });
    try {
      const all = await formSchemasApi.list(spaceId);
      set((s) => ({
        bySpace: { ...s.bySpace, [spaceId]: all },
        loading: false,
        fetched: true,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchAllFor: async (spaceId) => {
    if (!spaceId) return;
    set({ loading: true, error: null, activeSpaceId: spaceId });
    try {
      const all = await formSchemasApi.list(spaceId);
      set((s) => ({
        bySpace: { ...s.bySpace, [spaceId]: all },
        loading: false,
        fetched: s.activeSpaceId === spaceId || s.fetched,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  save: async (type, schema) => {
    const spaceId = currentSpaceIdOrNull();
    if (!spaceId) throw new Error('no current space');
    set({ saving: true, error: null, activeSpaceId: spaceId });
    try {
      const saved = await formSchemasApi.save(spaceId, type, schema);
      set((s) => ({
        bySpace: {
          ...s.bySpace,
          [spaceId]: { ...(s.bySpace[spaceId] ?? {}), [type]: saved },
        },
        saving: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, saving: false });
      throw e;
    }
  },

  reset: async () => {
    const spaceId = currentSpaceIdOrNull();
    if (!spaceId) throw new Error('no current space');
    set({ saving: true, error: null, activeSpaceId: spaceId });
    try {
      const all = await formSchemasApi.reset(spaceId);
      set((s) => ({ bySpace: { ...s.bySpace, [spaceId]: all }, saving: false }));
    } catch (e) {
      set({ error: (e as Error).message, saving: false });
      throw e;
    }
  },

  getLocal: (type) => {
    const spaceId = currentSpaceIdOrNull();
    return spaceId ? get().bySpace[spaceId]?.[type] ?? EMPTY : EMPTY;
  },
  getLocalFor: (spaceId, type) => get().bySpace[spaceId]?.[type] ?? EMPTY,
}));

// 兼容老 hook 签名 — 内部从 store 拿当前 spaceId
export const useFormSchema = (type: string) =>
  useFormSchemaStore((s) => {
    const spaceId = useSpaceStore.getState().currentId;
    return (spaceId && s.bySpace[spaceId]?.[type]) || EMPTY;
  });
