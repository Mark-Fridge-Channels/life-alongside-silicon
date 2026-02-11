import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  publicDir: 'public',
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/background.jpg': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
