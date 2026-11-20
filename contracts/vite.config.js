import path from "node:path"
import { fileURLToPath } from "node:url"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))

// Built into the site's dist/ and served at www.pro-algo.com/contracts/ (see vercel.json and
// tools/dev.mjs for the single-page fallback). The client pages are served from /discovery/<token>,
// /deal/<token> and /card/<token>, rewritten to contracts/client.html. The API it calls is the site's /api.
export default defineConfig({
  base: '/contracts/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(here, 'src') },
  },
  build: {
    outDir: '../dist/contracts',
    emptyOutDir: true,
    // index.html: the admin app; client.html: the client pages (/discovery, /deal, /card)
    rollupOptions: { input: { index: path.resolve(here, 'index.html'), client: path.resolve(here, 'client.html') } },
  },
  server: {
    // npm run dev here, with `npm run dev` at the repo root serving /api on 5173
    proxy: { '/api': 'http://localhost:5173' },
  },
});
