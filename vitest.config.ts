import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['src/test/setup-node.ts', 'src/test/setup-dom.ts'],
    include: [
      'src/mainview/**/*.{test,spec}.{ts,tsx}',
      'src/bun/**/*.{test,spec}.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/mainview/**/*.{ts,tsx}', 'src/bun/**/*.{ts,tsx}'],
      exclude: [
        'src/mainview/**/*.test.{ts,tsx}',
        'src/mainview/**/*.spec.{ts,tsx}',
        'src/bun/**/*.test.{ts,tsx}',
        'src/bun/**/*.spec.{ts,tsx}',
        'src/mainview/routeTree.gen.ts',
      ],
    },
  },
});
