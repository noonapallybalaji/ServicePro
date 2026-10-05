import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env.SERVICEPRO_API ?? 'http://localhost:5180';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5190,
    strictPort: true,
    // Same-origin API keeps the refresh cookie first-party (ADR 0005).
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/hubs': { target: API_TARGET, changeOrigin: true, ws: true },
    },
  },
  preview: { port: 5190 },
});
