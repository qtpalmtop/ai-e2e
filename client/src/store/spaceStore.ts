// 当前选中的空间
import { create } from 'zustand';
import { spaces as spacesApi, type Space } from '@/api';

type SpaceState = {
  list: Space[];
  currentId: string | null;
  load: () => Promise<void>;
  setCurrent: (id: string) => void;
  create: (name: string, description?: string) => Promise<Space>;
};

const LS_KEY = 'e2e.currentSpaceId';

export const useSpaceStore = create<SpaceState>((set, get) => ({
  list: [],
  currentId: localStorage.getItem(LS_KEY),
  load: async () => {
    const list = await spacesApi.list();
    set({ list });
    // 第一次进入：如果本地没记或当前空间不在列表里，自动选 common / 第一个
    const cur = get().currentId;
    const valid = cur && list.find((s) => s.id === cur);
    if (!valid) {
      const fallback =
        list.find((s) => s.isDefault) ?? list[0] ?? null;
      if (fallback) {
        localStorage.setItem(LS_KEY, fallback.id);
        set({ currentId: fallback.id });
      }
    }
  },
  setCurrent: (id) => {
    localStorage.setItem(LS_KEY, id);
    set({ currentId: id });
  },
  create: async (name, description) => {
    const s = await spacesApi.create(name, description);
    set({ list: [...get().list, s] });
    return s;
  },
}));

export function useCurrentSpace(): Space | null {
  // 用 useShallow 风格的最小订阅：避免空间列表变更（create/load）导致组件重渲染
  const list = useSpaceStore((s) => s.list);
  const id = useSpaceStore((s) => s.currentId);
  if (!id) return null;
  return list.find((s) => s.id === id) ?? null;
}
