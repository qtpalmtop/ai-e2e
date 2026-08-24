import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:4000',
                changeOrigin: true,
            },
            // WS 网关（live 预览事件流）：
            // target 显式用 ws://，避免 http-proxy 误用 http 协议去握 upgrade
            '/ws': {
                target: 'ws://localhost:4000',
                ws: true,
                changeOrigin: true,
            },
        },
    },
});
