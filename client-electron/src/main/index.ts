import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { createAppMenu } from './menu'
import { restoreWindowState, trackWindowState } from './windowState'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

async function createMainWindow(): Promise<void> {
  const state = await restoreWindowState()

  mainWindow = new BrowserWindow({
    title: '流程引擎',
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: '#f5f7fa',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 最大化状态恢复
  if (state.isMaximized) {
    mainWindow.maximize()
  }

  // 监听窗口移动/缩放/最大化，把最新状态写盘
  trackWindowState(mainWindow)

  // 准备好后再显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 拦截外链：默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 加载页面
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers(() => mainWindow)
  createAppMenu(() => mainWindow)
  await createMainWindow()

  app.on('activate', () => {
    // macOS: dock 图标点击且无窗口时重新打开
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // macOS 仍需保留 dock 上应用；其他平台退出
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
