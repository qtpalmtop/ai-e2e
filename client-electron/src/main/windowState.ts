import { app, BrowserWindow, screen } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

const DEFAULT_STATE: WindowState = {
  width: 1440,
  height: 900,
  isMaximized: false,
}

function getStateFile(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

async function readState(): Promise<WindowState> {
  try {
    const raw = await fs.readFile(getStateFile(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<WindowState>
    return { ...DEFAULT_STATE, ...parsed }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

/**
 * 把窗口位置校正到当前显示器范围内，避免上次外接屏导致窗口跑到不可见位置
 */
function clampToDisplay(state: WindowState): WindowState {
  if (state.x === undefined || state.y === undefined) return state
  const displays = screen.getAllDisplays()
  const visible = displays.some((d) => {
    const { x, y, width, height } = d.workArea
    return (
      state.x! >= x &&
      state.y! >= y &&
      state.x! + state.width <= x + width &&
      state.y! + state.height <= y + height
    )
  })
  if (visible) return state
  const { x, y } = screen.getPrimaryDisplay().workArea
  return { ...state, x: x + 40, y: y + 40 }
}

export async function restoreWindowState(): Promise<WindowState> {
  const state = await readState()
  return clampToDisplay(state)
}

let saveTimer: NodeJS.Timeout | null = null

export function trackWindowState(win: BrowserWindow): void {
  const save = () => {
    if (!win || win.isDestroyed()) return
    const isMaximized = win.isMaximized()
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds()
    const payload: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    }
    // 防抖，避免拖动窗口时频繁写盘
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      fs.writeFile(getStateFile(), JSON.stringify(payload, null, 2), 'utf-8').catch(() => {
        // 静默失败，状态记忆不影响主流程
      })
    }, 500)
  }

  win.on('resize', save)
  win.on('move', save)
  win.on('maximize', save)
  win.on('unmaximize', save)
  win.on('close', save)
}
