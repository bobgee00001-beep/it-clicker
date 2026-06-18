import { defineConfig } from 'vitest/config';

// Engine-Tests laufen in reinem Node-Environment — kein DOM, kein Svelte.
// Die deterministische Engine ist framework-frei; das spiegeln wir hier.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
