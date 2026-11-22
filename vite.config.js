import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径：dist 丢到任何静态目录（含子路径）都能直接跑
  base: './',
  server: {
    // 监听所有网卡，同一局域网里的手机才能访问（127.0.0.1 只给本机）
    host: '0.0.0.0',
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    // 源码就在 GitHub 上，部署包不用带 3MB 的 sourcemap
    sourcemap: false,
  },
});
