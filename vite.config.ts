import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const apiTarget = process.env.VITE_API_TARGET || 'https://games.khe.ee'
  const apiOrigin = process.env.VITE_API_ORIGIN || 'https://games.khe.ee'
  const apiRewrite = process.env.VITE_API_REWRITE === 'true'

  return {
    base: command === 'build' ? '/adventure/' : '/',
    plugins: [react(), tailwindcss()],
    build: {
      license: { fileName: 'third-party-licenses.md' },
    },
    server: {
      proxy: {
        // Dev-time proxy so the V1 API path works against the live homelab
        // during local development. Override with VITE_API_TARGET env if needed.
        // The production proxy allowlists Origin, so pin dev requests to the
        // public game origin instead of whichever localhost port Vite picked.
        '/adventure/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
          headers: {
            Origin: apiOrigin,
          },
          ...(apiRewrite
            ? { rewrite: (path) => path.replace(/^\/adventure\/api/, '') }
            : {}),
        },
      },
    },
  }
})
