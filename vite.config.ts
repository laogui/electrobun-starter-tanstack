import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, type PluginOption, type UserConfig } from 'vite';

const SHARED_REACT_MODULE = /\/node_modules\/(react|react-dom|scheduler)\//;
const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const pluginT0 = process.env.VITE_PLUGIN_T0 === '1';
/** Any trusted-plugin harness flag (scripts/trusted-plugin-t*) is set. */
const pluginProbeRequested = Object.entries(process.env).some(
  ([key, value]) => key.startsWith('VITE_PLUGIN_T') && value === '1'
);
const sharedEntries = {
  'host-react': 'shared/react.ts',
  'host-react-dom': 'shared/react-dom.ts',
  'host-react-dom-client': 'shared/react-dom-client.ts',
  'host-jsx-runtime': 'shared/jsx-runtime.ts',
  ...(pluginT0
    ? { 'host-sdk': 't0/sdk.ts', 'host-sdk-react': 't0/react.ts' }
    : {
        'host-sdk': '../../../packages/plugin-sdk/index.js',
        'host-sdk-react': '../../../packages/plugin-sdk/react.js',
      }),
};
const sharedImports = {
  react: 'host-react',
  'react-dom': 'host-react-dom',
  'react-dom/client': 'host-react-dom-client',
  'react/jsx-runtime': 'host-jsx-runtime',
  '@ghostboard/sdk': 'host-sdk',
  '@ghostboard/sdk/react': 'host-sdk-react',
};

export default defineConfig(async ({ command }) => {
  const { devtools } = await import('@tanstack/devtools-vite');

  // Vite 7's `PluginOption = Thenable<Plugin | ... | PluginOption[]>` recursive
  // type makes TS bail with "excessive stack depth" whenever a plugin returns
  // `Plugin[]` (paraglide / tanstack-router do). Casting the array exit type
  // sidesteps the recursion without weakening individual plugin signatures.
  const plugins = [
    {
      name: 'ghostboard-shared-plugin-imports',
      enforce: 'pre',
      resolveId(source, importer) {
        if (
          command !== 'build' ||
          importer !==
            resolve(
              projectRoot,
              'src/mainview/plugins/runtime/sharedRuntime.ts'
            )
        ) {
          return;
        }
        const runtimeEntries: Record<string, string> = {
          '../shared/react': 'host-react',
          '../shared/react-dom': 'host-react-dom',
          '../shared/react-dom-client': 'host-react-dom-client',
          '../shared/jsx-runtime': 'host-jsx-runtime',
          '../../../../packages/plugin-sdk/index.js': 'host-sdk',
          ...(pluginT0
            ? {}
            : { '../../../../packages/plugin-sdk/react.js': 'host-sdk-react' }),
        };
        const entry = runtimeEntries[source];
        if (entry) {
          // Native imports preserve the exact import-map module namespace, not
          // a bundler-created namespace with merely equal exported functions.
          return { id: `views://mainview/assets/${entry}.js`, external: true };
        }
      },
      transformIndexHtml: {
        order: 'post',
        handler: () => [
          ...(pluginT0
            ? [
                {
                  tag: 'script',
                  children: `globalThis.__pluginT0Errors=[];addEventListener('error',e=>globalThis.__pluginT0Errors.push(e.message));addEventListener('unhandledrejection',e=>globalThis.__pluginT0Errors.push(String(e.reason?.stack??e.reason)));`,
                  injectTo: 'head-prepend' as const,
                },
              ]
            : []),
          {
            tag: 'script',
            attrs: { type: 'importmap' },
            children: JSON.stringify({
              imports: Object.fromEntries(
                Object.entries(sharedImports).map(([specifier, name]) => [
                  specifier,
                  command === 'build'
                    ? `views://mainview/assets/${name}.js`
                    : !pluginT0 &&
                        (name === 'host-sdk' || name === 'host-sdk-react')
                      ? `/@fs${resolve(projectRoot, 'src/mainview/plugins', sharedEntries[name])}`
                      : `/plugins/${sharedEntries[name as keyof typeof sharedEntries]}`,
                ])
              ),
            }),
            injectTo: 'head-prepend',
          },
        ],
      },
    },
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
    define: {
      // Gates src/mainview/plugins/probes.ts (t0…t5 verification probes) so a
      // release build tree-shakes them; harness builds opt in via env flags.
      __GHOSTBOARD_PLUGIN_PROBES__: JSON.stringify(
        command === 'serve' || pluginProbeRequested
      ),
    },
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
        preserveEntrySignatures: 'strict',
        input: {
          main: resolve(projectRoot, 'src/mainview/index.html'),
          ...Object.fromEntries(
            Object.entries(sharedEntries).map(([name, path]) => [
              name,
              resolve(projectRoot, 'src/mainview/plugins', path),
            ])
          ),
        },
        output: {
          entryFileNames: (chunk) =>
            chunk.name.startsWith('host-')
              ? 'assets/[name].js'
              : 'assets/[name]-[hash].js',
          chunkFileNames: (chunk) =>
            chunk.name === 'host-react-runtime'
              ? 'assets/[name].js'
              : 'assets/[name]-[hash].js',
          manualChunks: (id) =>
            SHARED_REACT_MODULE.test(id) ? 'host-react-runtime' : undefined,
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  } satisfies UserConfig;
});
