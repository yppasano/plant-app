import { defineConfig } from 'vite'

export default defineConfig({
  base: '/plant/',
  server: {
    port: 3000,
    host: true,
    strictPort: true
  },
  css: {
    devSourcemap: true
  }
})