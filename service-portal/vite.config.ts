import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = (env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')

  return {
    plugins: [react()],
    server: {
      port: 5174,
      proxy: {
        '/trpc': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    test: {
      environment: 'node',
    },
  }
})
