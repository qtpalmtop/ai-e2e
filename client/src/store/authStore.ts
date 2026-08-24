// 登录态：localStorage 不放 token（httpOnly cookie 由浏览器自动管理）
// 这里只缓存 "是否登录 / 用户概要"，避免每次刷新都打 /auth/me
import { create } from 'zustand';
import { auth, type Me } from '@/api';

type AuthState = {
  me: Me | null;
  loaded: boolean; // 是否已经尝试加载过（区分"未登录"和"还没查"）
  load: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname?: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  me: null,
  loaded: false,
  load: async () => {
    try {
      const me = await auth.me();
      set({ me, loaded: true });
    } catch {
      set({ me: null, loaded: true });
    }
  },
  login: async (username, password) => {
    await auth.login(username, password);
    const me = await auth.me();
    set({ me, loaded: true });
  },
  register: async (username, password, nickname) => {
    await auth.register(username, password, nickname);
    const me = await auth.me();
    set({ me, loaded: true });
  },
  logout: async () => {
    try {
      await auth.logout();
    } catch {
      /* ignore */
    }
    set({ me: null });
  },
}));
