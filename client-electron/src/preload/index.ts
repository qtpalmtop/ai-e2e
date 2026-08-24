import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../shared/types'

const api: ElectronAPI = {
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  readTextFile: (path) => ipcRenderer.invoke('fs:readText', path),
  writeTextFile: (path, content) => ipcRenderer.invoke('fs:writeText', path, content),
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),
  getBackendBaseUrl: () => ipcRenderer.invoke('config:getBackendBaseUrl'),
  setBackendBaseUrl: (url) => ipcRenderer.invoke('config:setBackendBaseUrl', url),
  getPlatform: () => ipcRenderer.invoke('app:platform'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
}

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[preload] failed to expose api', err)
}
