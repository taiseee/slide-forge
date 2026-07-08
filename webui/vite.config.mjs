import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 開発時(vite dev)は API サーバ(node webui/server.mjs <file.md>)を別プロセスで起動し、
// /api と /preview をプロキシする。配布時は `npm run webui` が build → server 起動を行う。
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5757',
      '/preview': 'http://127.0.0.1:5757',
    },
  },
});
