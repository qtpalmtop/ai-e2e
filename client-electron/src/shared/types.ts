/**
 * 主进程、preload、渲染进程之间共享的类型定义
 */

/** 渲染进程可通过 window.api 访问的全部方法 */
export interface ElectronAPI {
  /** 弹原生「打开」文件对话框，返回选择的路径（取消则返回 null） */
  openFileDialog: (options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>

  /** 弹原生「保存」文件对话框，返回目标路径 */
  saveFileDialog: (options?: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>

  /** 读取本地文件内容（utf-8） */
  readTextFile: (path: string) => Promise<string>

  /** 把文本写入本地文件 */
  writeTextFile: (path: string, content: string) => Promise<void>

  /** 系统通知 */
  notify: (title: string, body: string) => Promise<void>

  /** 获取后端 baseUrl（用户在设置页配置，持久化在主进程） */
  getBackendBaseUrl: () => Promise<string>

  /** 设置后端 baseUrl */
  setBackendBaseUrl: (url: string) => Promise<void>

  /** 获取平台信息 */
  getPlatform: () => Promise<NodeJS.Platform>

  /** 获取应用版本 */
  getAppVersion: () => Promise<string>

  /** 打开外部链接 */
  openExternal: (url: string) => Promise<void>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
