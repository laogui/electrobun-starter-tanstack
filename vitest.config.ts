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
      'src/shared/**/*.{test,spec}.{ts,tsx}',
      // Pure routing helpers of the docs-site drop-in (packages/plugin-docs-site/README.md).
      'packages/plugin-docs-site/apps/web/lib/**/*.{test,spec}.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/mainview/**/*.{ts,tsx}',
        'src/bun/**/*.{ts,tsx}',
        'src/shared/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/mainview/**/*.test.{ts,tsx}',
        'src/mainview/**/*.spec.{ts,tsx}',
        'src/bun/**/*.test.{ts,tsx}',
        'src/bun/**/*.spec.{ts,tsx}',
        'src/shared/**/*.test.{ts,tsx}',
        'src/shared/**/*.spec.{ts,tsx}',
        'src/mainview/routeTree.gen.ts',
      ],
    },
  },
});
