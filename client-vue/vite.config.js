import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import path from 'node:path';
// Vue 3 + Element Plus（按需自动导入）+ Pinia + Vue Router
// 端口 5174 避开 React 版 5173；/api 代理到 4000
export default defineConfig({
    plugins: [
        vue(),
        // 自动导入 Vue/Ement Plus 的 API（ref/computed/ElMessage 等）
        AutoImport({
            imports: ['vue', 'vue-router', 'pinia'],
            resolvers: [ElementPlusResolver()],
            dts: 'src/auto-imports.d.ts',
        }),
        // 自动注册 el-* 组件 + Icons
        Components({
            resolvers: [ElementPlusResolver()],
            dts: 'src/components.d.ts',
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        port: 5174,
        proxy: {
            '/api': {
                target: 'http://localhost:4000',
                changeOrigin: true,
            },
            // WS 网关（live 预览事件流）
            '/ws': {
                target: 'ws://localhost:4000',
                ws: true,
                changeOrigin: true,
            },
        },
    },
});
