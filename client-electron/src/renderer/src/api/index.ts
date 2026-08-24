// API 客户端（与 React 版完全一致的数据协议）
// 关键点：
//  1. 全部走 cookie 鉴权（credentials: 'include'）
//  2. 大部分接口需要带 spaceId
//  3. WebSocket 路径 /ws/cases?caseId=xxx，需用 ws-token 鉴权
//  4. Electron 渲染进程：baseUrl 从主进程拿（用户设置页配置）
import type { CaseSchema } from '@/types/schema'
import type { FormSchema, FormSchemas } from '@/types/formSchema'

// ---- 运行时后端地址 ----
// 优先从主进程拿（用户在 Electron 设置页配置）；拿不到就退回相对路径（同源，浏览器场景）
let _httpBase = ''
let _wsBase = ''
let _initialized = false

export function resetBase(): void {
  _httpBase = ''
  _wsBase = ''
  _initialized = false
}

async function ensureBase(): Promise<void> {
  if (_initialized) return
  if (typeof window !== 'undefined' && window.api) {
    try {
      const backend = await window.api.getBackendBaseUrl()
      if (backend) {
        // 例: 'http://localhost:4000' -> 'http://localhost:4000/api'
        _httpBase = `${backend.replace(/\/+$/, '')}/api`
        // 例: 'http://localhost:4000' -> 'ws://localhost:4000/ws'
        const wsProto = backend.startsWith('https://') ? 'wss://' : 'ws://'
        _wsBase = `${wsProto}${backend.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/ws`
      }
    } catch {
      // ignore
    }
  }
  _initialized = true
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  await ensureBase()
  const hasBody = init?.body !== undefined && init?.body !== null
  const res = await fetch(`${_httpBase}${path}`, {
    credentials: 'include',
    // 仅在有 body 时才设 Content-Type，否则 Fastify 会因空 body+application/json 报 500
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ---------- 类型 ----------

export type SpaceRole = 'OWNER' | 'EDITOR' | 'VIEWER'

export type Me = {
  id: string
  username: string
  nickname?: string | null
  createdAt: number
  spaces: { id: string; name: string; isDefault: boolean; role: SpaceRole }[]
}

export type Space = {
  id: string
  name: string
  isDefault: boolean
  description?: string | null
  role?: SpaceRole
  createdAt?: number
}

export type SpaceMember = {
  userId: string
  username: string
  nickname?: string | null
  role: SpaceRole
  joinedAt: number
}

export type SpaceDetail = Space & {
  members: SpaceMember[]
}

export type CaseSummary = {
  id: string
  name: string
  spaceId: string
  updatedAt: number
  createdAt: number
}

export type CaseFull = CaseSummary & { schema: CaseSchema }

// ---------- Auth ----------

export const auth = {
  login: (username: string, password: string) =>
    request<{ user: { id: string; username: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  register: (username: string, password: string, nickname?: string) =>
    request<{ user: { id: string; username: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, nickname }),
    }),
  me: () => request<Me>('/auth/me'),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  // 拿一个短期 token 用于 WebSocket 鉴权（httpOnly cookie 在跨域 WS 握手时不会带上）
  wsToken: () => request<{ token: string; expiresIn: number }>('/auth/ws-token'),
}

// ---------- Spaces ----------

export const spaces = {
  list: () => request<Space[]>('/spaces'),
  get: (spaceId: string) => request<SpaceDetail>(`/spaces/${spaceId}`),
  create: (name: string, description?: string) =>
    request<Space>('/spaces', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  addMember: (spaceId: string, username: string, role: SpaceRole) =>
    request<{ ok: true }>(`/spaces/${spaceId}/members`, {
      method: 'POST',
      body: JSON.stringify({ username, role }),
    }),
  removeMember: (spaceId: string, userId: string) =>
    request<{ ok: true }>(`/spaces/${spaceId}/members/${userId}`, { method: 'DELETE' }),
}

// ---------- Cases ----------

export const cases = {
  list: (spaceId: string) =>
    request<CaseSummary[]>(`/cases?spaceId=${encodeURIComponent(spaceId)}`),
  get: (id: string) => request<CaseFull>(`/cases/${id}`),
  create: (spaceId: string, name: string, schema?: CaseSchema) =>
    request<CaseFull>('/cases', {
      method: 'POST',
      body: JSON.stringify({ spaceId, name, schema }),
    }),
  update: (id: string, body: { name?: string; schema?: CaseSchema }) =>
    request<CaseFull>(`/cases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  remove: (id: string) => request<{ ok: true }>(`/cases/${id}`, { method: 'DELETE' }),
  translate: (id: string) =>
    request<{ ok: true; file: string }>(`/cases/${id}/translate`, { method: 'POST' }),
  run: (id: string) =>
    request<{ ok: boolean; logs: string; duration: number }>(`/cases/${id}/run`, {
      method: 'POST',
    }),
  liveRun: (id: string) =>
    request<{ ok: true; message: string }>(`/cases/${id}/live-run`, { method: 'POST' }),
  // ---------- 编辑锁 ----------
  acquireLock: (id: string) =>
    request<{
      lockedBy: { userId: string; lockedAt: number } | null
      mine: boolean
      ttlMs: number
    }>(`/cases/${id}/acquire-lock`, { method: 'POST' }),
  releaseLock: (id: string, opts?: { force?: boolean }) => {
    const force = opts?.force === true
    return request<{ ok: true; released: boolean }>(`/cases/${id}/release-lock`, {
      method: 'POST',
      body: force ? JSON.stringify({ force: true }) : undefined,
    })
  },
  heartbeat: (id: string) =>
    request<{ ok: true; ttlMs: number }>(`/cases/${id}/heartbeat`, { method: 'POST' }),
  getLock: (id: string) =>
    request<{
      lockedBy: { id: string; username: string; nickname: string | null } | null
      lockedAt: number | null
      ageMs: number
      expired: boolean
      mine: boolean
      ttlMs: number
    }>(`/cases/${id}/lock`),
}

// ---------- Form Schemas ----------

export const formSchemas = {
  list: (spaceId: string) =>
    request<FormSchemas>(`/form-schemas?spaceId=${encodeURIComponent(spaceId)}`),
  get: (spaceId: string, nodeType: string) =>
    request<FormSchema>(
      `/form-schemas/${nodeType}?spaceId=${encodeURIComponent(spaceId)}`,
    ),
  save: (spaceId: string, nodeType: string, schema: FormSchema) =>
    request<FormSchema>(
      `/form-schemas/${nodeType}?spaceId=${encodeURIComponent(spaceId)}`,
      { method: 'PUT', body: JSON.stringify({ nodeType, atoms: schema.atoms }) },
    ),
  reset: (spaceId: string) =>
    request<FormSchemas>(
      `/form-schemas/reset?spaceId=${encodeURIComponent(spaceId)}`,
      { method: 'POST' },
    ),
}

// ---------- WebSocket ----------
// Electron 渲染进程：URL 来自主进程配置（用户在设置页填写）
// 浏览器环境：直连当前 host（开发态）或 VITE_WS_URL 注入

export type LiveEvent =
  | { type: 'hello'; caseId: string }
  | { type: 'start'; caseName: string; file?: string; ts: number }
  | { type: 'step-start'; name: string; index: number; loop?: { count: number } }
  | {
      type: 'step-end'
      name: string
      index: number
      duration: number
      screenshot?: string | null
      ok: boolean
      error?: string
      loop?: { count: number }
    }
  | { type: 'log'; text: string; level?: string }
  | { type: 'done'; ok: boolean; duration: number }
  | { type: 'error'; message: string }

export async function openLiveSocket(
  caseId: string,
  onEvent: (e: LiveEvent) => void,
  onError?: () => void,
): Promise<WebSocket> {
  await ensureBase()
  let token: string | undefined
  try {
    const r = await auth.wsToken()
    token = r.token
  } catch {
    onError?.()
    throw new Error('ws token unavailable')
  }

  const params = `caseId=${encodeURIComponent(caseId)}&token=${encodeURIComponent(token)}`
  let url: string
  if (_wsBase) {
    url = `${_wsBase}/cases?${params}`
  } else {
    // 浏览器场景的兜底
    const envWs = (import.meta as any).env?.VITE_WS_URL as string | undefined
    if (envWs) {
      url = `${envWs}/cases?${params}`
    } else {
      url = `${
        window.location.protocol === 'https:' ? 'wss' : 'ws'
      }://${window.location.host}/ws/cases?${params}`
    }
  }

  const ws = new WebSocket(url)
  ws.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as LiveEvent)
    } catch {
      /* ignore */
    }
  }
  ws.onerror = () => onError?.()
  return ws
}
