import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
    cors: true,
    watch: {
      ignored: ['**/dist/**', '**/artifacts/**', '**/test-results/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
    cors: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: 'index.html',
        assetTest: 'asset-test.html',
      },
    },
  },
});
