import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Docker-Build hat kein .git im Build-Context (context: ./frontend) — dort greift
// stattdessen die VITE_GIT_BRANCH env var (gesetzt via Dockerfile ARG GIT_BRANCH).
function gitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
  } catch {
    return process.env.VITE_GIT_BRANCH || 'main'
  }
}

export default defineConfig({
  define: {
    __GIT_BRANCH__: JSON.stringify(gitBranch()),
  },
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts:  ['recharts'],
          dayjs:   ['dayjs'],
        }
      }
    }
  },
})
