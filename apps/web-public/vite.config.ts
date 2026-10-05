import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env.SERVICEPRO_API ?? 'http://localhost:5180';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5192,
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: { port: 5192 },
});
