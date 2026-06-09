import type { ElectrobunConfig } from 'electrobun';

export default {
  app: {
    name: 'GhostBoard',
    identifier: 'com.ghostboard.app',
    version: '1.0.0',
  },
  build: {
    // Vite builds both renderer HTML entries to dist/, we copy from there.
    // The settings HTML references the shared Vite assets under mainview.
    copy: {
      'dist/index.html': 'views/mainview/index.html',
      'dist/settings.html': 'views/settingsview/index.html',
      'dist/assets': 'views/mainview/assets',
    },
    // Ignore Vite output in watch mode — HMR handles view rebuilds separately
    watchIgnore: ['dist/**'],
    mac: {
      icon: 'icon.iconset/icon_256x256.png',
      bundleCEF: false,
    },
    linux: {
      icon: 'icon.iconset/icon_256x256.png',
      bundleCEF: false,
    },
    win: {
      icon: 'icon.iconset/icon_256x256.png',
      bundleCEF: false,
    },
  },
} satisfies ElectrobunConfig;
