import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/',
  define: {
    '__BUILD_ID__': JSON.stringify(process.env.COMMIT_REF || process.env.BUILD_ID || 'dev')
  },
  build: {
    outDir: '../../dist-chat',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html')
    }
  },
  root: '.'
})
