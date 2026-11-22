import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径：dist 丢到任何静态目录（含子路径）都能直接跑
  base: './',
  server: {
    // 0.0.0.0 才能让同一局域网里的手机访问（127.0.0.1 只给本机）
    host: true,
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    sourcemap: true,
  },
});
