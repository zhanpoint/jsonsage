import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    workbox: { globPatterns: ['**/*.{js,mjs,wasm,css,html,svg,png,woff2}'], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, navigateFallback: 'index.html' },
    manifest: { name: 'JsonSage', short_name: 'JsonSage', start_url: '.', display: 'standalone', background_color: '#111827', theme_color: '#111827', icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }] },
  })],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  worker: { format: 'es' },
});
