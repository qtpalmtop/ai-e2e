import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

type GetMainWindow = () => BrowserWindow | null

/** 后端 baseUrl 等运行时配置，持久化在 userData/config.json */
const configFile = (): string => join(app.getPath('userData'), 'config.json')

async function readConfig(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(configFile(), 'utf-8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeConfig(cfg: Record<string, unknown>): Promise<void> {
  await fs.writeFile(configFile(), JSON.stringify(cfg, null, 2), 'utf-8')
}

export function registerIpcHandlers(getMainWindow: GetMainWindow): void {
  // 文件：打开
  ipcMain.handle('dialog:openFile', async (_evt, options: { title?: string; filters?: { name: string; extensions: string[] }[] } = {}) => {
    const win = getMainWindow()
    const res = await dialog.showOpenDialog(win ?? undefined!, {
      title: options.title ?? '选择文件',
      properties: ['openFile'],
      filters: options.filters,
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  // 文件：保存
  ipcMain.handle('dialog:saveFile', async (_evt, options: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] } = {}) => {
    const win = getMainWindow()
    const res = await dialog.showSaveDialog(win ?? undefined!, {
      title: options.title ?? '保存文件',
      defaultPath: options.defaultPath,
      filters: options.filters,
    })
    if (res.canceled || !res.filePath) return null
    return res.filePath
  })

  // 文件：读
  ipcMain.handle('fs:readText', async (_evt, path: string) => {
    return await fs.readFile(path, 'utf-8')
  })

  // 文件：写
  ipcMain.handle('fs:writeText', async (_evt, path: string, content: string) => {
    await fs.writeFile(path, content, 'utf-8')
  })

  // 系统通知
  ipcMain.handle('notify', async (_evt, title: string, body: string) => {
    if (!Notification.isSupported()) return
    new Notification({ title, body }).show()
  })

  // 后端 baseUrl 读写
  ipcMain.handle('config:getBackendBaseUrl', async () => {
    const cfg = await readConfig()
    return (cfg.backendBaseUrl as string) || ''
  })

  ipcMain.handle('config:setBackendBaseUrl', async (_evt, url: string) => {
    const cfg = await readConfig()
    cfg.backendBaseUrl = url
    await writeConfig(cfg)
  })

  // 平台 / 版本
  ipcMain.handle('app:platform', () => process.platform)
  ipcMain.handle('app:version', () => app.getVersion())

  // 外部链接
  ipcMain.handle('shell:openExternal', async (_evt, url: string) => {
    await shell.openExternal(url)
  })
}
