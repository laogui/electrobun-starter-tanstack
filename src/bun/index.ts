import { existsSync } from 'node:fs';
import Electrobun, {
  ApplicationMenu,
  BrowserView,
  BrowserWindow,
  Updater,
  Utils,
} from 'electrobun/bun';
import { buildAIConfig } from './aiConfig';
import { loadAICredentials, migrateLegacyAIApiKey } from './aicredentials';
import {
  getAppInfoData,
  installQuitFlush,
  isQuitDeferredForFlush,
  setApplicationMenu,
} from './appLifecycle';
import { getAppChannel, getAppDataRoot } from './appPaths';
import { appState } from './appState';
import { subscribeNoteChanges } from './contentEvents';
import {
  DiagnosticsService,
  initialReportAppInfo,
  installDiagnosticLogging,
} from './diagnostics';
import { createExtensionSchedulerService } from './extensions/schedulerService';
import { startLocalHttpServer } from './localHttpServer';
import { getMainViewUrl } from './mainView';
import { migrateLegacyTagsFromNotes } from './nodeMetadata';
import type { RpcContext } from './rpc/context';
import { createAIHandlers } from './rpc/handlers/ai';
import { createAppHandlers } from './rpc/handlers/app';
import { createAttachmentsHandlers } from './rpc/handlers/attachments';
import { createCanvasHandlers } from './rpc/handlers/canvas';
import { createDiagnosticsHandlers } from './rpc/handlers/diagnostics';
import { createExportHandlers } from './rpc/handlers/export';
import { createExtensionsHandlers } from './rpc/handlers/extensions';
import { createLicenseHandlers } from './rpc/handlers/license';
import { createMetadataHandlers } from './rpc/handlers/metadata';
import { createNotesHandlers } from './rpc/handlers/notes';
import { createSettingsHandlers } from './rpc/handlers/settings';
import { createTemplatesHandlers } from './rpc/handlers/templates';
import { createTrashHandlers } from './rpc/handlers/trash';
import { createViewsHandlers } from './rpc/handlers/views';
import { createWidgetsHandlers } from './rpc/handlers/widgets';
import type { CanvasRPC, RpcRequestHandlers } from './rpc/types';
import { withRpcWriteValidation } from './rpc/writeParamSchemas';
import { getCachedSettings, loadSettings } from './settings';
import { loadUserPrefs } from './userprefs';
import { initWorkspace, seedFirstRunIfNeeded } from './workspace';

async function main() {
  if (!process.env.VITEST) {
    installQuitFlush();
  }
  if (!process.env.VITEST) {
    try {
      appState.diagnostics = new DiagnosticsService(
        getAppDataRoot(),
        initialReportAppInfo(getAppChannel())
      );
      installDiagnosticLogging(appState.diagnostics);
      const service = appState.diagnostics;
      Electrobun.events.on('before-quit', (event: unknown) => {
        // The first quit attempt is deferred while the renderer flushes.
        if (!isQuitDeferredForFlush(event)) {
          service.shutdown();
        }
      });
      process.once('exit', (code) => {
        if (code === 0) {
          service.shutdown();
        }
      });
      const fatalError = (error: unknown) => {
        try {
          service.captureCrash(
            {
              source: 'main',
              name:
                error instanceof Error
                  ? error.name.slice(0, 128)
                  : 'UnhandledError',
              message: String(
                error instanceof Error ? error.message : error
              ).slice(0, 4096),
              stack:
                error instanceof Error
                  ? error.stack?.slice(0, 16_384)
                  : undefined,
            },
            true
          );
        } finally {
          process.exit(1);
        }
      };
      process.once('uncaughtException', fatalError);
      process.once('unhandledRejection', fatalError);
      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
          service.shutdown();
          Utils.quit();
        });
      }
      const timer = setInterval(() => {
        try {
          service.heartbeat();
        } catch (error) {
          console.warn('[diagnostics] Heartbeat failed:', error);
        }
      }, 60_000);
      timer.unref();
      service.flush();
      getAppInfoData()
        .then((info) => service.updateAppInfo(info))
        .catch((error) => {
          console.warn('[diagnostics] Could not read app information:', error);
        });
    } catch (error) {
      appState.diagnostics = null;
      console.warn('[diagnostics] Could not initialize diagnostics:', error);
    }
  }
  // NOTE on accelerators: Electrobun only auto-attaches standard macOS
  // shortcuts for the text-editing roles (undo, redo, cut, copy, paste,
  // pasteAndMatchStyle, delete, selectAll). All other roles — including quit,
  // close, minimize, hide, hideOthers — require an explicit `accelerator`,
  // otherwise pressing the system shortcut does nothing.
  setApplicationMenu();

  ApplicationMenu.on('application-menu-clicked', (event: unknown) => {
    const e = event as { data?: { action?: string } };
    if (e.data?.action === 'openSearch') {
      appState.mainRpc?.send?.openSearch({});
    }
    if (e.data?.action === 'canvasUndo') {
      appState.mainRpc?.send?.canvasUndo({});
    }
    if (e.data?.action === 'canvasRedo') {
      appState.mainRpc?.send?.canvasRedo({});
    }
  });

  // Resolve workspace path from user prefs first; fall back to the default
  // when prefs are missing or point at a path that no longer exists.
  const prefs = await loadUserPrefs();
  const preferredPath =
    prefs.workspacePath && existsSync(prefs.workspacePath)
      ? prefs.workspacePath
      : undefined;
  const wsPath = initWorkspace(preferredPath);
  await seedFirstRunIfNeeded(wsPath);
  const [, , aiCredentials] = await Promise.all([
    migrateLegacyTagsFromNotes(wsPath),
    loadSettings(wsPath),
    loadAICredentials(),
  ]);
  // The LLM API key lives outside the workspace so it never lands in
  // `<workspace>/.ghostboard/settings.json`. Cache it in memory for the
  // duration of the run; the secure file is only touched on read/write.
  appState.cachedAIKeys = aiCredentials.providers ?? {};
  appState.legacyEnvProvider = getCachedSettings().aiProvider;
  if (aiCredentials.apiKey) {
    const migrated = await migrateLegacyAIApiKey(
      getCachedSettings().aiProvider
    );
    if (migrated) {
      appState.cachedAIKeys[getCachedSettings().aiProvider] = migrated;
    }
  }
  // Local HTTP endpoint for renderer calls that do not fit Electrobun RPC
  // well. The handle holds the localhost base URL + bearer token the renderer
  // connects with. AI config is resolved per-request so settings updates take
  // effect without restarting the server.
  appState.localHttpServer = startLocalHttpServer({
    getAIConfig: () => buildAIConfig(),
    getWorkspacePath: () => wsPath,
  });
  subscribeNoteChanges((event) => {
    appState.mainRpc?.send?.noteChanged(event);
  });
  const extensionScheduler = createExtensionSchedulerService({
    wsPath,
    deliver: (delivery) => {
      appState.mainRpc?.send?.extensionTaskFired(delivery);
    },
  });
  const url = await getMainViewUrl();
  const isDevChannel = (await Updater.localInfo.channel()) === 'dev';

  const rpcContext: RpcContext = {
    wsPath,
    extensionScheduler,
    isDevChannel,
  };
  // Typed against every CanvasRPC bun request so a handler dropped during a
  // refactor is a compile error rather than a silent runtime 404.
  const requestHandlers: RpcRequestHandlers<
    keyof CanvasRPC['bun']['requests']
  > = {
    ...createCanvasHandlers(rpcContext),
    ...createWidgetsHandlers(rpcContext),
    ...createExtensionsHandlers(rpcContext),
    ...createNotesHandlers(rpcContext),
    ...createAttachmentsHandlers(rpcContext),
    ...createExportHandlers(rpcContext),
    ...createSettingsHandlers(rpcContext),
    ...createDiagnosticsHandlers(rpcContext),
    ...createAIHandlers(rpcContext),
    ...createTrashHandlers(rpcContext),
    ...createAppHandlers(rpcContext),
    ...createViewsHandlers(rpcContext),
    ...createMetadataHandlers(rpcContext),
    ...createTemplatesHandlers(rpcContext),
    ...createLicenseHandlers(rpcContext),
  };
  const rpc = (appState.mainRpc = BrowserView.defineRPC<CanvasRPC>({
    maxRequestTime: Number.POSITIVE_INFINITY,
    handlers: {
      requests: withRpcWriteValidation(requestHandlers),
      messages: {},
    },
  }));

  appState.mainWindow = new BrowserWindow({
    title: 'React + Tailwind + Vite',
    url,
    rpc,
    titleBarStyle: 'hiddenInset',
    frame: {
      width: 900,
      height: 700,
      x: 200,
      y: 200,
    },
  });

  // Arm the host timer for this workspace. Tasks that come due before the
  // renderer is listening are re-delivered until it acks.
  extensionScheduler.tick().catch((error) => {
    console.warn('[extensions] scheduler start failed', error);
  });

  return appState.mainWindow;
}

main().catch((err) => {
  console.error(err);
  appState.diagnostics?.captureCrash(
    {
      source: 'main',
      name: 'StartupError',
      message: String(err instanceof Error ? err.message : err).slice(0, 4096),
      stack: err instanceof Error ? err.stack?.slice(0, 16_384) : undefined,
    },
    true
  );
  if (!process.env.VITEST) {
    process.exit(1);
  }
});
