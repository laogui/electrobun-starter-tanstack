import { defineConfig } from 'vitest/config';

// Curated subset: security trust boundaries (local HTTP auth) and
// data-integrity invariants (import/export
// round-trips, corruption recovery, undo history). Node environment by
// default; individual files opt into jsdom via a docblock.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    setupFiles: ['src/test/setup-node.ts'],
    include: [
      'src/mainview/**/*.{test,spec}.{ts,tsx}',
      'src/bun/**/*.{test,spec}.{ts,tsx}',
      'src/shared/**/*.{test,spec}.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/paraglide/**', 'src/mainview/routeTree.gen.ts'],
      reporter: ['text', 'html'],
    },
  },
});
