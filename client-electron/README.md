# 流程引擎 · Electron 桌面端

把 `client-vue`（Vue 3 + Element Plus + @vue-flow）的渲染层装进 Electron，做成一个跨平台桌面应用。
**只加壳子**，不内置后端——用户首次启动后在 **设置页** 填入后端地址即可。

> 旧版（React）和浏览器版（`client-vue`）代码完全保留，互不影响。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 渲染进程 | Vue 3 + Vite + Pinia + Vue Router + Element Plus（按需）+ @vue-flow/core |
| 主进程 | Electron 32 + TypeScript |
| 预加载 | `contextBridge` 暴露受限 IPC |
| 打包 | electron-builder（macOS dmg / Windows nsis） |

## 目录结构

```
client-electron/
├── electron.vite.config.ts   # 主/preload/renderer 三个进程统一配置
├── electron-builder.yml      # 打包配置
├── package.json
├── src/
│   ├── main/                 # 主进程
│   │   ├── index.ts          # 入口：BrowserWindow + 生命周期
│   │   ├── windowState.ts    # 窗口位置/大小/最大化记忆
│   │   ├── menu.ts           # 原生应用菜单
│   │   └── ipc.ts            # IPC handlers
│   ├── preload/
│   │   └── index.ts          # contextBridge 暴露 window.api
│   ├── shared/
│   │   └── types.ts          # 跨进程共享类型
│   └── renderer/             # 渲染进程（= client-vue 适配版）
│       ├── index.html
│       └── src/
│           ├── api/          # 适配后端 baseUrl 来自 window.api
│           ├── components/   # 节点、画布、表单设计器
│           ├── pages/        # ListPage / CanvasPage / FormDesignerPage / SettingsPage
│           ├── router/
│           ├── stores/
│           └── ...
└── build/                    # 图标资源（可选）
```

## 开发

```bash
cd client-electron
npm install
npm run dev          # 启动 electron-vite，自动打开窗口（HMR）
```

> 后端地址默认是 `http://localhost:4000`。可在设置页改。

## 类型检查

```bash
npm run typecheck
```

## 打包

```bash
# macOS（arm64 + x64，输出 .dmg）
npm run package:mac

# Windows（x64，输出 .exe + nsis 安装器）
npm run package:win
```

产物在 `release/<version>/`。

## 与旧版的差异

| 项 | client-vue | client-electron |
| --- | --- | --- |
| 后端 baseUrl | 走 Vite 代理（`/api`）或 `VITE_WS_URL` | 渲染进程从主进程 `getBackendBaseUrl()` 拿，用户可在设置页配置 |
| 持久化 | localStorage | localStorage + `app.getPath('userData')/config.json` |
| 窗口 | 浏览器 tab | 独立 BrowserWindow，记忆位置/大小 |
| 文件 I/O | 仅下载 | 原生「打开/保存」对话框 + 文件读写 |
| 系统通知 | ❌ | ✅ |

## 设置项

- **后端地址**：必填，例 `http://10.0.0.5:4000`（HTTP 与 WebSocket 自动转换）
- **导入/导出用例 JSON**：用原生文件对话框
- **系统通知**：测试平台通知能力

## 与 React / Vue 浏览器版的关系

完全独立的三个目录 `client/`、`client-vue/`、`client-electron/`，共享后端协议（NestJS server-nest）即可。三者可以并存跑、互不冲突。
