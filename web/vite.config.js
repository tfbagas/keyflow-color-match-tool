import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  esbuild: {
    drop: ['console', 'debugger']
  },
  build: {
    minify: 'esbuild',
    sourcemap: false
  },
  server: {
    port: 5173,
    host: true
  }
})
