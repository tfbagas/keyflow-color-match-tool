import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import JavaScriptObfuscator from 'javascript-obfuscator'

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 0.75,
  selfDefending: true,
  disableConsoleOutput: true,
  renameGlobals: false,
  renameProperties: false,
  target: 'browser-no-eval',
  ignoreImports: true
}

function selectivePostMinifyObfuscator() {
  return {
    name: 'selective-post-minify-obfuscator',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue
        const isCoreChunk =
          fileName.includes('coreEngine') ||
          fileName.includes('colorMatchWorker')

        if (!isCoreChunk) continue

        const result = JavaScriptObfuscator.obfuscate(
          chunk.code,
          OBFUSCATOR_OPTIONS
        )
        chunk.code = result.getObfuscatedCode()
      }
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    selectivePostMinifyObfuscator()
  ],
  worker: {
    plugins: () => [selectivePostMinifyObfuscator()]
  },
  esbuild: {
    drop: ['console', 'debugger']
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')
          if (normalized.includes('/node_modules/')) {
            return 'vendor'
          }
          if (
            normalized.endsWith('/src/utils/colorGrading.js') ||
            normalized.endsWith('/src/utils/kfplugPackager.js')
          ) {
            return 'coreEngine'
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    host: true
  }
})
