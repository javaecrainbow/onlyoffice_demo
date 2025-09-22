import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0', // 允许外部访问
    port: 5173,      // 默认端口
    strictPort: true, // 如果端口被占用则报错而不是自动换端口
  }
})
