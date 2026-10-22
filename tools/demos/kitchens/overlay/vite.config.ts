import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Public demo build (buildalgo.co.il/catalog/kitchens/): static files only, no dev-server API.
// https://vite.dev/config/
export default defineConfig({
  base: '/catalog/kitchens/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1100 },   // three.js + react-three-fiber chunk (~1 MB, ~270 kB gzip), loaded lazily
})
