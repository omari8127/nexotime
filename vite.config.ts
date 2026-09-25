import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { serviceWorkerPlugin } from './vite-sw-plugin.ts'

const dir = path.dirname(fileURLToPath(import.meta.url))

// Tunnel hosts (ngrok / cloudflare) use random subdomains — allow them so the
// demo can be shared with a client without editing config each time.
const tunnelHosts = ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.io', '.trycloudflare.com']

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorkerPlugin(dir)],
  resolve: {
    alias: {
      '@': path.resolve(dir, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  server: {
    host: true,
    allowedHosts: tunnelHosts,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: tunnelHosts,
  },
})
