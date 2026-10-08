import { defineConfig } from 'vitest/config';
import path from 'path';

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
  },
});
