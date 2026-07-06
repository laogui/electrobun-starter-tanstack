import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(async ({ command }) => {
  const { devtools } = await import('@tanstack/devtools-vite');

  // Vite 7's `PluginOption = Thenable<Plugin | ... | PluginOption[]>` recursive
  // type makes TS bail with "excessive stack depth" whenever a plugin returns
  // `Plugin[]` (paraglide / tanstack-router do). Casting the array exit type
  // sidesteps the recursion without weakening individual plugin signatures.
  const plugins = [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
    }),
    devtools(),
    tailwindcss(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './routes',
      generatedRouteTree: './routeTree.gen.ts',
      routeFileIgnorePattern: '\\.(test|spec)\\.(ts|tsx)$',
    }),
    viteReact(),
  ] as PluginOption[];

  return {
    base: command === 'build' ? 'views://mainview/' : '/',
    plugins,
    resolve: {
      tsconfigPaths: true,
      dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    root: 'src/mainview',
    build: {
      outDir: '../../dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(projectRoot, 'src/mainview/index.html'),
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
