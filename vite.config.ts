import pages from '@hono/vite-cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    pages({
      entry: 'src/index.tsx',
    }),
    devServer({
      adapter,
      entry: 'src/index.tsx',
    }),
  ],
})
