import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readBackendPort(): string {
  try {
    const env = readFileSync(resolve(__dirname, '../.env'), 'utf-8')
    const match = env.match(/^PORT=(\d+)/m)
    if (match) return match[1]
  } catch {
    // Missing .env is fine during frontend-only development.
  }
  return process.env.PORT || '8000'
}

const backendPort = readBackendPort()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://localhost:${backendPort}`,
    },
  },
})
