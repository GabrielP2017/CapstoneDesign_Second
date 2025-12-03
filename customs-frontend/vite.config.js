import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false, // 프로덕션에서는 소스맵 비활성화 (보안)
    minify: 'esbuild', // esbuild로 빠른 압축
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'chart-vendor': ['chart.js', 'react-chartjs-2', 'recharts'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true, // 외부 접근 허용
  },
  preview: {
    port: 4173,
    host: true,
  },
})
