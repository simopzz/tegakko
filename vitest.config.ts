import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

// Separate from vite.config.ts (no VitePWA/manifest concerns here) but still
// needs the Svelte plugin so `.svelte` files can be imported and mounted in
// tests. `svelteTesting()` adds the `browser` resolve condition (so Svelte's
// client runtime, not its SSR runtime, is what tests exercise) and wires
// automatic DOM cleanup between tests.
export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
});
