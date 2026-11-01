import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_TARGET = process.env.SERVICEPRO_API ?? 'http://localhost:5180';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Installable technician app (PLAN.md §6.1). API responses are never cached by the
    // service worker; offline tolerance lives in the app's query cache. Not in the phone app
    // (`--mode native`): its files are already on the device.
    mode !== 'native' &&
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Pakka Fix Partner',
        short_name: 'Pakka Partner',
        description: 'Your jobs, offers and earnings.',
        theme_color: '#001d3f',
        background_color: '#f6f7f9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
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
}));
