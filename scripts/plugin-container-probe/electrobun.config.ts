import type { ElectrobunConfig } from 'electrobun';

export default {
  app: {
    name: 'GhostBoardPluginProbe',
    identifier: 'com.ghostboard.plugin-probe',
    version: '0.0.1',
  },
  build: {
    bun: { entrypoint: 'index.ts' },
    copy: {
      '../../node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm':
        'bun/emscripten-module.wasm',
    },
    mac: {
      // Probe-only: GhostBoard itself stays on the system WebKit renderer.
      bundleCEF: true,
      defaultRenderer: 'native',
    },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
  runtime: { exitOnLastWindowClosed: false },
} satisfies ElectrobunConfig;
