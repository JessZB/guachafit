import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { construirRuntimeCachingApi } from './src/lib/api-cache-pattern';

export default defineConfig(({ mode }) => {
  // WU4: el patrón de cache se deriva de la API realmente configurada (local o producción).
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // U4 (Ola 4): actualización GUIADA. El SW nuevo queda `waiting` y la app avisa
        // ("Nueva versión disponible") para que el usuario aplique y recargue cuando quiera;
        // nunca se activa ni se recarga en silencio a mitad de un entrenamiento.
        // `virtual:pwa-register` (src/lib/pwa-registro.ts) reemplaza al antiguo registerSW.js.
        registerType: 'prompt',
        // Assets reales en apps/web/public (antes apuntaban a archivos inexistentes).
        includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
        manifest: {
          id: '/',
          name: 'GUACHAFIT — Entrenamiento y Alto Rendimiento',
          short_name: 'GUACHAFIT',
          description: 'Plataforma integral para entrenadores y atletas de alto rendimiento',
          lang: 'es',
          dir: 'ltr',
          theme_color: '#11161f',
          background_color: '#11161f',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          categories: ['fitness', 'health', 'sports'],
          // Sin `orientation`: queda en "any" para que las tablets de los coaches
          // puedan rotar a landscape (los alumnos siguen bloqueados por su postura de uso).
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'apple-touch-icon-180x180.png',
              sizes: '180x180',
              type: 'image/png',
              purpose: 'any',
            },
          ],
          shortcuts: [
            {
              name: 'Entrenar hoy',
              short_name: 'Entrenar',
              description: 'Abrir el entrenamiento de hoy',
              url: '/app/hoy',
              icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Mi menú',
              short_name: 'Mi menú',
              description: 'Ver el menú del alumno',
              url: '/app/menu',
              icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // D4: NetworkFirst con corte de 4 s y sin rutas /auth/ (ver api-cache-pattern.ts).
          runtimeCaching: construirRuntimeCachingApi(env.VITE_API_URL),
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
