import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'e2e', '.next'],
    css: true,
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // jsdom emulates a browser DOM but Vitest runs test files through Vite's
    // SSR/vite-node pipeline, which resolves `exports` conditions using the
    // Node.js runtime by default. @lit/react ships a no-op "node" build (for
    // SSR) that silently drops element properties instead of applying them
    // to the custom element -- without both of these, every Obc*-wrapped web
    // component renders with empty props in tests.
    conditions: ['browser'],
  },
  ssr: {
    resolve: {
      conditions: ['browser'],
    },
  },
});
