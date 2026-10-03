import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => ({
  // Demo derlemesi GitHub Pages'te bir alt klasörden sunulur; göreli yollar her yerde çalışır
  base: mode === 'demo' ? './' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // AG Grid tek parça ~1,2 MB; sadece tablolu ekranlarla yüklenir
    chunkSizeWarningLimit: 1300,
    rolldownOptions: {
      output: {
        // Kütüphaneler ayrı paketlerde: uygulama değişince tarayıcı önbelleğinde kalırlar; grafik ve tablo
        // kütüphaneleri sadece onları kullanan ekranlarla yüklenir. Gruplar bağımlılıklarını da topladığı için
        // React en yüksek öncelikte (yoksa AG Grid grubu React'ı da içine alır).
        codeSplitting: {
          groups: [
            { name: 'echarts', test: /node_modules[\\/](echarts|zrender)[\\/]/, priority: 30 },
            { name: 'ag-grid', test: /node_modules[\\/](ag-grid-community|ag-grid-react|@ag-grid-community)[\\/]/, priority: 30 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/, priority: 40 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
}))
