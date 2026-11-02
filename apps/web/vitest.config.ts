import { defineConfig } from 'vitest/config';
import path from 'path';

// V12 (M5-L1B): la suite de la web asume el día local del proyecto (`America/Caracas`). Se fija
// aquí, en el proceso principal, antes de crear los workers de test (que heredan el entorno), y
// también en `vitest.setup.ts` dentro de cada worker. Node ≥ 16 relee la zona al asignar
// `process.env.TZ` en runtime (también en Windows), así que el resultado no depende de la zona
// horaria del runner (máquina local o CI).
process.env.TZ = 'America/Caracas';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@guachafit/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    // Entorno `node` por defecto (funciones y `renderToStaticMarkup`). Los specs de interacción
    // (`*.spec.tsx` con Testing Library) declaran `// @vitest-environment jsdom` en su 1.ª línea.
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    globals: false,
    testTimeout: 15000,
    // V12: garantiza `TZ=America/Caracas` en cada worker antes de importar cualquier test.
    setupFiles: ['./vitest.setup.ts'],
    // UX-02: permite que Vitest procese `index.css` para que las importaciones con `?raw`
    // devuelvan el contenido real del archivo en lugar de una cadena vacía.
    css: {
      include: [/(^|[\\/])index\.css(\?.*)?$/],
    },
  },
});
