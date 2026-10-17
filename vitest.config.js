import { defineConfig } from 'vitest/config';

// Unit tests cover the pure code: the main-process connectors' text handling and the renderer's lib/ helpers.
export default defineConfig({
  test: { include: ['test/**/*.test.js'], environment: 'node', testTimeout: 20000 }
});
