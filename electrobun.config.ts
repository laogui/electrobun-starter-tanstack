import type { ElectrobunConfig } from 'electrobun';

export default {
  app: {
    name: 'GhostBoard',
    identifier: 'com.ghostboard.app',
    version: '1.0.0',
  },
  build: {
    bun: {
      define: {
        __GHOSTBOARD_SUPPORT_API_URL__: JSON.stringify(
          process.env.GHOSTBOARD_SUPPORT_API_URL ?? ''
        ),
        // The T0 plugin experiment exposes arbitrary file and network access;
        // only harness builds (scripts/trusted-plugin-t0) compile it in.
        __GHOSTBOARD_ENABLE_PLUGIN_T0__: JSON.stringify(
          process.env.GHOSTBOARD_ENABLE_PLUGIN_T0 === '1'
        ),
        // T1–T5 probe hosts (loopback installs, scripted consent, no safe
        // mode); only the trusted-plugin harness builds compile them in, and
        // the stable channel ignores them regardless (plugins/probeGate.ts).
        __GHOSTBOARD_ENABLE_PLUGIN_PROBES__: JSON.stringify(
          process.env.GHOSTBOARD_ENABLE_PLUGIN_PROBES === '1'
        ),
      },
    },
    artifactFolder: process.env.GHOSTBOARD_BUILD_ARTIFACT_DIR ?? 'artifacts',
    // Vite builds the renderer HTML entry to dist/, we copy from there.
    copy: {
      'dist/index.html': 'views/mainview/index.html',
      'dist/assets': 'views/mainview/assets',
    },
    // Ignore Vite output in watch mode — HMR handles view rebuilds separately
    watchIgnore: ['dist/**'],
    mac: {
      // The postBuild hook copies a prebuilt AppIcon.icns into the bundle.
      // This avoids iconutil rejecting .iconset folders on newer local toolchains.
      icons: undefined,
      bundleCEF: false,
      // Microphone access for the audio-recording (voice memo) node. Electrobun
      // maps `audio-input` to NSMicrophoneUsageDescription in the generated
      // Info.plist so packaged/notarized builds can prompt for TCC permission.
      entitlements: {
        'com.apple.security.device.audio-input':
          'GhostBoard needs microphone access to record voice memos.',
      },
      // Signing/notarization run only when credentials are present (CI or a
      // local .env). Without them, non-dev builds simply skip signing so local
      // iteration keeps working. dev builds never sign.
      codesign: Boolean(process.env.ELECTROBUN_DEVELOPER_ID),
      notarize: Boolean(process.env.ELECTROBUN_APPLEID),
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
  scripts: {
    postBuild: 'scripts/copy-mac-icon.ts',
  },
  // Where published artifacts are hosted. The updater fetches
  // `${baseUrl}{channel}-{os}-{arch}-update.json` from here. Points at the
  // Cloudflare R2 custom domain (see .env / R2_PUBLIC_BASE_URL).
  release: {
    baseUrl: process.env.R2_PUBLIC_BASE_URL ?? '',
  },
} satisfies ElectrobunConfig;
