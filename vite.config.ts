import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import pdfPackage from 'pdfjs-dist/package.json' with { type: 'json' };
import { createFileProxy, httpsDnsLookup } from './server/file-proxy.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'PREVIEW_');
  const proxyOptions = { resolve: env.PREVIEW_DNS_OVER_HTTPS ? httpsDnsLookup(env.PREVIEW_DNS_OVER_HTTPS) : undefined };
  return {
    plugins: [{
      name: 'file-preview-proxy',
      configureServer(server) { server.middlewares.use('/api/preview', createFileProxy(proxyOptions)); },
      configurePreviewServer(server) { server.middlewares.use('/api/preview', createFileProxy(proxyOptions)); },
    }, react(), viteStaticCopy({ targets: ['cmaps', 'standard_fonts', 'wasm', 'iccs'].map(folder => ({
      src: `node_modules/pdfjs-dist/${folder}/*`, dest: `assets/pdf-preview/${pdfPackage.version}/${folder}`, rename: { stripBase: true },
    })) }), VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,mjs,wasm,css,html,svg,png,woff2}'],
        globIgnores: ['**/optional-*', '**/OfficePreview-*', '**/MediaPreview-*', '**/officePreview.worker-*', '**/slidesPreview.worker-*', '**/pdf.worker*', '**/pdf-preview/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, navigateFallback: 'index.html',
        runtimeCaching: [{
          urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/(optional-|OfficePreview-|MediaPreview-|(?:office|slides)Preview\.worker-|pdf\.worker|pdf-preview\/)/.test(url.pathname),
          handler: 'CacheFirst', options: { cacheName: 'file-preview', expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 } },
        }],
      },
      manifest: { name: 'JsonSage', short_name: 'JsonSage', start_url: '.', display: 'standalone', background_color: '#111827', theme_color: '#111827', icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }] },
    })],
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
    },
    optimizeDeps: {
      // Discover lazy views and worker dependencies together before serving optimized modules.
      entries: ['index.html', 'src/**/*.{ts,tsx}'],
      include: ['quicktype-core/dist/esm/Run.js', 'quicktype-core/dist/esm/input/Inputs.js', 'typescript'],
    },
    worker: { format: 'es', rollupOptions: { output: {
      chunkFileNames: chunk => chunk.moduleIds.some(id => /(?:\/mammoth\/|\/src\/lib\/officePreview\.ts$)/.test(id.replaceAll('\\', '/')))
        ? 'assets/optional-[name]-[hash].js' : 'assets/[name]-[hash].js',
    } } },
    build: { rollupOptions: { output: {
      // Keep office rendering and its language dictionaries out of startup precaching.
      chunkFileNames: chunk => ['OfficePreview', 'PdfPreview', 'SlidesPreview', 'MediaPreview'].includes(chunk.name) || ['@univerjs', '@videojs'].some(scope => chunk.facadeModuleId?.replaceAll('\\', '/').includes('/node_modules/' + scope + '/'))
        ? 'assets/optional-[name]-[hash].js' : 'assets/[name]-[hash].js',
    } } },
  };
});
