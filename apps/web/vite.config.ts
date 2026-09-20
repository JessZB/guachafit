import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { buildApiCachePattern } from './src/lib/api-cache-pattern';
import { API_RUNTIME_CACHE_NAME } from './src/lib/cache-runtime';

export default defineConfig(({ mode }) => {
  // WU4: el patrón de cache se deriva de la API realmente configurada (local o producción).
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiCachePattern = buildApiCachePattern(env.VITE_API_URL);

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'GUACHAFIT - High-Performance Training',
          short_name: 'GUACHAFIT',
          description: 'Plataforma integral para entrenadores y atletas de alto rendimiento',
          theme_color: '#11161f',
          background_color: '#11161f',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: apiCachePattern,
              method: 'GET',
              handler: 'NetworkFirst',
              options: {
                cacheName: API_RUNTIME_CACHE_NAME,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24, // 24 hours
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@guachafit/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
    server: {
      port: 3000,
    },
  };
});
