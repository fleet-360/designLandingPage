import path from "node:path"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Built into the site's dist/ and served at www.pro-algo.com/contracts/ (see vercel.json and
// tools/dev.mjs for the single-page fallback). The API it calls is the site's /api.
export default defineConfig({
  base: '/contracts/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    outDir: '../dist/contracts',
    emptyOutDir: true,
  },
  server: {
    // npm run dev here, with `npm run dev` at the repo root serving /api on 5173
    proxy: { '/api': 'http://localhost:5173' },
  },
});
