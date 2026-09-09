import { defineConfig } from 'vite';
import baseConfig from './vite.config.ts';

const modules: Record<string, { field: string; exports: string[] }> = {
  react: {
    field: 'react',
    exports: [
      'Activity',
      'Children',
      'Component',
      'cache',
      'cacheSignal',
      'cloneElement',
      'createContext',
      'createElement',
      'createRef',
      'default',
      'Fragment',
      'forwardRef',
      'isValidElement',
      'lazy',
      'memo',
      'Profiler',
      'PureComponent',
      'StrictMode',
      'Suspense',
      'startTransition',
      'use',
      'useActionState',
      'useCallback',
      'useContext',
      'useDebugValue',
      'useDeferredValue',
      'useEffect',
      'useEffectEvent',
      'useId',
      'useImperativeHandle',
      'useInsertionEffect',
      'useLayoutEffect',
      'useMemo',
      'useOptimistic',
      'useReducer',
      'useRef',
      'useState',
      'useSyncExternalStore',
      'useTransition',
      'version',
    ],
  },
  'react-dom': {
    field: 'reactDom',
    exports: [
      'createPortal',
      'default',
      'flushSync',
      'preconnect',
      'prefetchDNS',
      'preinit',
      'preinitModule',
      'preload',
      'preloadModule',
      'requestFormReset',
      'unstable_batchedUpdates',
      'useFormState',
      'useFormStatus',
      'version',
    ],
  },
  'react-dom/client': {
    field: 'reactDomClient',
    exports: ['createRoot', 'default', 'hydrateRoot'],
  },
  'react/jsx-runtime': {
    field: 'jsxRuntime',
    exports: ['Fragment', 'jsx', 'jsxs'],
  },
  '@ghostboard/sdk': { field: 'sdk', exports: ['definePlugin'] },
};
const prefix = '\0ghostboard-runtime:';

export default defineConfig({
  ...baseConfig,
  plugins: [
    ...(baseConfig.plugins ?? []),
    {
      name: 'ghostboard-global-runtime-shim',
      enforce: 'pre',
      resolveId(source) {
        if (Object.hasOwn(modules, source)) {
          return `${prefix}${source}`;
        }
      },
      load(id) {
        if (!id.startsWith(prefix)) {
          return;
        }
        const module = modules[id.slice(prefix.length)];
        if (!module) {
          return;
        }
        return [
          'const runtime = globalThis.__ghostboardPluginRuntime;',
          'if (!runtime) throw new Error("GhostBoard plugin runtime is unavailable");',
          `const shared = runtime.${module.field};`,
          ...module.exports.map((name) =>
            name === 'default'
              ? 'export default shared.default;'
              : `export const ${name} = shared.${name};`
          ),
        ].join('\n');
      },
    },
  ],
  build: {
    ...baseConfig.build,
    rollupOptions: {
      ...baseConfig.build?.rollupOptions,
      external: [],
    },
  },
});
