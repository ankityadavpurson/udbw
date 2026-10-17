import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The page carries a strict Content-Security-Policy. The dev server needs inline scripts and a WebSocket for hot
// reload, so the policy is left out while serving (it stays in every build).
const devWithoutCsp = {
  name: 'dev-without-csp',
  apply: 'serve',
  transformIndexHtml: html => html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/i, '')
};

export default defineConfig({
  root: path.resolve('src'),
  plugins: [react(), devWithoutCsp],
  base: './',
  server: { host: '127.0.0.1', strictPort: false },
  build: { outDir: path.resolve('dist'), emptyOutDir: true }
});
