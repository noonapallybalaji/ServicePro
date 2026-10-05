import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_TARGET = process.env.SERVICEPRO_API ?? 'http://localhost:5180';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable technician app (PLAN.md §6.1). API responses are never cached by the
    // service worker; offline tolerance lives in the app's query cache.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'ServicePro Technician',
        short_name: 'ServicePro',
        description: 'Your jobs, offers and earnings.',
        theme_color: '#0b6276',
        background_color: '#f6f7f5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/hubs/],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5191,
    strictPort: true,
    // Same-origin API keeps the refresh cookie first-party (ADR 0005).
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/hubs': { target: API_TARGET, changeOrigin: true, ws: true },
    },
  },
  preview: { port: 5191 },
});
