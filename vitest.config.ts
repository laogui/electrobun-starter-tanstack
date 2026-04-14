import { resolve } from 'node:path';

import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // Paraglide messages are generated at build time and may not exist in CI
      // or in a fresh clone. Provide a Proxy-based mock so every message key
      // returns its own name as a placeholder string.
      '../../paraglide/messages.js': resolve(
        __dirname,
        'src/mainview/__mocks__/paraglideMessages.ts'
      ),
      '../../../paraglide/messages.js': resolve(
        __dirname,
        'src/mainview/__mocks__/paraglideMessages.ts'
      ),
      '../../../../paraglide/messages.js': resolve(
        __dirname,
        'src/mainview/__mocks__/paraglideMessages.ts'
      ),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/mainview/**/*.{test,spec}.{ts,tsx}'],
  },
});
