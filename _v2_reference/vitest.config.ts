import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ compilerOptions: { generate: 'client' } })],
  resolve: {
    conditions: ['browser', 'default'],
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/ui/**/*.test.ts', 'jsdom']],
    globals: true,
    setupFiles: ['./vitest-setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
