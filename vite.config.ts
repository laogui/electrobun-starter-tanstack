import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(async ({ command }) => {
  const { devtools } = await import('@tanstack/devtools-vite');

  return {
    base: command === 'build' ? 'views://mainview/' : '/',
    plugins: [
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/paraglide',
      }),
      devtools(),
      tsconfigPaths({
        projects: ['../../tsconfig.json'],
      }),
      tailwindcss(),
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: './routes',
        generatedRouteTree: './routeTree.gen.ts',
      }),
      viteReact(),
    ],
    resolve: {
      dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    root: 'src/mainview',
    build: {
      outDir: '../../dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(projectRoot, 'src/mainview/index.html'),
          settings: resolve(projectRoot, 'src/mainview/settings.html'),
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
