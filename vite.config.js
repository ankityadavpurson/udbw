import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve('src'),
  plugins: [react()],
  base: './',
  build: { outDir: path.resolve('dist'), emptyOutDir: true }
});
