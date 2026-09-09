import { copyFile } from 'node:fs/promises';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'plugin-manifest',
      closeBundle: () => copyFile('manifest.json', 'dist/manifest.json'),
    },
  ],
  build: {
    emptyOutDir: true,
    sourcemap: true,
    lib: { entry: 'src/app.tsx', formats: ['es'], fileName: () => 'app.js' },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        '@ghostboard/sdk',
      ],
    },
  },
});
