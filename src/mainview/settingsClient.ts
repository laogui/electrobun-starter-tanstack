export type ThemeSetting = 'dark' | 'light' | 'system';
export type LocaleSetting = 'en' | 'zh';
export type FontFamilySetting = 'mono' | 'serif' | 'system';
export type CanvasBackgroundSetting = 'default' | 'mono' | 'paper';

export const AUTO_SAVE_INTERVAL_OPTIONS = [500, 800, 2000, 5000] as const;
export type AutoSaveIntervalSetting =
  (typeof AUTO_SAVE_INTERVAL_OPTIONS)[number];

export interface AppSettings {
  autoSaveInterval: AutoSaveIntervalSetting;
  canvasBackground: CanvasBackgroundSetting;
  canvasSnapToGrid: boolean;
  fontFamily: FontFamilySetting;
  locale: LocaleSetting;
  theme: ThemeSetting;
}

export interface TrashEntry {
  deletedAt: number;
  trashFile: string;
  trashId: string;
  view: { file: string; id: string; name: string };
}

export interface UnlinkedFileEntry {
  file: string;
  hasFrontmatterId: boolean;
  modifiedAt: number;
  noteId: string | null;
  size: number;
  title: string;
}

export interface WorkspaceInfo {
  isDefault: boolean;
  path: string;
}

export interface AppInfo {
  channel: string;
  hash: string;
  identifier: string;
  name: string;
  version: string;
}

export interface UpdateCheckResult {
  currentHash: string;
  error?: string;
  hash: string;
  updateAvailable: boolean;
  version: string;
}

export interface ExportArchiveResult {
  canceled?: boolean;
  filePath?: string;
  size?: number;
  success: boolean;
}

export interface SwitchWorkspaceResult {
  canceled?: boolean;
  path?: string;
  success: boolean;
}

export interface SettingsClient {
  checkForUpdate: () => Promise<UpdateCheckResult>;
  clearAllTrash: () => Promise<{
    purged: number;
    success: boolean;
  }>;
  deleteUnlinkedNotes: (
    files: string[]
  ) => Promise<{ deleted: string[]; skipped: string[] }>;
  exportWorkspaceArchive: () => Promise<ExportArchiveResult>;
  getAppInfo: () => Promise<AppInfo>;
  getSettings: () => Promise<AppSettings>;
  getWorkspaceInfo: () => Promise<WorkspaceInfo>;
  listTrash: () => Promise<TrashEntry[]>;
  openWorkspaceFolder: () => Promise<{ success: boolean }>;
  purgeTrash: (trashId: string) => Promise<{ success: boolean }>;
  restoreTrash: (trashId: string) => Promise<{ success: boolean }>;
  saveSettings: (settings: AppSettings) => Promise<{ success: boolean }>;
  scanUnlinkedNotes: () => Promise<UnlinkedFileEntry[]>;
  switchWorkspace: () => Promise<SwitchWorkspaceResult>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  locale: 'en',
  fontFamily: 'system',
  canvasBackground: 'default',
  canvasSnapToGrid: true,
  autoSaveInterval: 800,
};

interface SettingsRPC {
  bun: {
    requests: {
      checkForUpdate: {
        params: Record<string, unknown>;
        response: UpdateCheckResult;
      };
      clearAllTrash: {
        params: Record<string, unknown>;
        response: { purged: number; success: boolean };
      };
      deleteUnlinkedNotes: {
        params: { files: string[] };
        response: { deleted: string[]; skipped: string[] };
      };
      exportWorkspaceArchive: {
        params: Record<string, unknown>;
        response: ExportArchiveResult;
      };
      getAppInfo: {
        params: Record<string, unknown>;
        response: AppInfo;
      };
      getSettings: {
        params: Record<string, unknown>;
        response: AppSettings;
      };
      getWorkspaceInfo: {
        params: Record<string, unknown>;
        response: WorkspaceInfo;
      };
      listTrash: {
        params: Record<string, unknown>;
        response: TrashEntry[];
      };
      openWorkspaceFolder: {
        params: Record<string, unknown>;
        response: { success: boolean };
      };
      purgeTrash: {
        params: { trashId: string };
        response: { success: boolean };
      };
      restoreTrash: {
        params: { trashId: string };
        response: { success: boolean };
      };
      saveSettings: {
        params: AppSettings;
        response: { success: boolean };
      };
      scanUnlinkedNotes: {
        params: Record<string, unknown>;
        response: { entries: UnlinkedFileEntry[] };
      };
      switchWorkspace: {
        params: Record<string, unknown>;
        response: SwitchWorkspaceResult;
      };
    };
    messages: Record<never, unknown>;
  };
  webview: {
    requests: Record<string, { params: unknown; response: unknown }>;
    messages: {
      trashUpdated: Record<never, unknown>;
    };
  };
}

export const TRASH_UPDATED_EVENT = 'trash-updated';

interface SettingsElectroview {
  rpc?: {
    request: {
      checkForUpdate: (
        params: Record<string, unknown>
      ) => Promise<UpdateCheckResult>;
      clearAllTrash: (
        params: Record<string, unknown>
      ) => Promise<{ purged: number; success: boolean }>;
      deleteUnlinkedNotes: (params: {
        files: string[];
      }) => Promise<{ deleted: string[]; skipped: string[] }>;
      exportWorkspaceArchive: (
        params: Record<string, unknown>
      ) => Promise<ExportArchiveResult>;
      getAppInfo: (params: Record<string, unknown>) => Promise<AppInfo>;
      getSettings: (params: Record<string, unknown>) => Promise<AppSettings>;
      getWorkspaceInfo: (
        params: Record<string, unknown>
      ) => Promise<WorkspaceInfo>;
      listTrash: (params: Record<string, unknown>) => Promise<TrashEntry[]>;
      openWorkspaceFolder: (
        params: Record<string, unknown>
      ) => Promise<{ success: boolean }>;
      purgeTrash: (params: {
        trashId: string;
      }) => Promise<{ success: boolean }>;
      restoreTrash: (params: {
        trashId: string;
      }) => Promise<{ success: boolean }>;
      saveSettings: (params: AppSettings) => Promise<{ success: boolean }>;
      scanUnlinkedNotes: (
        params: Record<string, unknown>
      ) => Promise<{ entries: UnlinkedFileEntry[] }>;
      switchWorkspace: (
        params: Record<string, unknown>
      ) => Promise<SwitchWorkspaceResult>;
    };
  };
}

let initPromise: Promise<SettingsElectroview | null> | null = null;

async function initElectrobun(): Promise<SettingsElectroview | null> {
  if (!('__electrobunWebviewId' in globalThis)) {
    return null;
  }

  try {
    const mod = await import('electrobun/view');
    const Electrobun = mod.default;
    const { Electroview } = mod;
    const rpc = Electroview.defineRPC<SettingsRPC>({
      // Several settings handlers block on native modal dialogs
      // (`switchWorkspace`, `exportWorkspaceArchive`, `openWorkspaceFolder`)
      // or run long-lived work (zipping a large workspace, the update check).
      // The default request timeout is only 1s, which made those requests
      // reject with "RPC request timed out" the moment the user paused on the
      // OS file picker — surfacing as "no response" / "Workspace export
      // failed". These operations are user-driven and have no sensible upper
      // bound, so disable the renderer-side timeout entirely. Handler errors
      // still reject promptly because the bun side replies with a failure
      // response when a handler throws.
      maxRequestTime: Number.POSITIVE_INFINITY,
      handlers: {
        requests: {},
        messages: {
          trashUpdated: () => {
            globalThis.dispatchEvent(new CustomEvent(TRASH_UPDATED_EVENT));
          },
        },
      },
    });

    return new Electrobun.Electroview({ rpc }) as SettingsElectroview;
  } catch (error) {
    console.warn('[settings] Failed to initialize Electrobun RPC:', error);
    return null;
  }
}

async function getElectrobun(): Promise<SettingsElectroview | null> {
  if (!initPromise) {
    initPromise = initElectrobun();
  }

  return await initPromise;
}

const STUB_APP_INFO: AppInfo = {
  channel: 'dev',
  hash: '',
  identifier: 'dev.ghostboard',
  name: 'GhostBoard',
  version: '0.0.0',
};

const STUB_WORKSPACE: WorkspaceInfo = {
  path: '',
  isDefault: true,
};

export function createSettingsClient(): SettingsClient {
  return {
    getSettings: async () => {
      const electrobun = await getElectrobun();
      return electrobun?.rpc?.request.getSettings({}) ?? DEFAULT_SETTINGS;
    },
    saveSettings: async (settings) => {
      const electrobun = await getElectrobun();
      if (!electrobun?.rpc) {
        return { success: false };
      }

      return await electrobun.rpc.request.saveSettings(settings);
    },
    listTrash: async () => {
      const electrobun = await getElectrobun();
      if (!electrobun?.rpc) {
        return [];
      }
      return await electrobun.rpc.request.listTrash({});
    },
    restoreTrash: async (trashId) => {
      const electrobun = await getElectrobun();
      if (!electrobun?.rpc) {
        return { success: false };
      }
      return await electrobun.rpc.request.restoreTrash({ trashId });
    },
    purgeTrash: async (trashId) => {
      const electrobun = await getElectrobun();
      if (!electrobun?.rpc) {
        return { success: false };
      }
      return await electrobun.rpc.request.purgeTrash({ trashId });
    },
    clearAllTrash: async () => {
      const electrobun = await getElectrobun();
      if (!electrobun?.rpc) {
        return { success: false, purged: 0 };
      }
      return await electrobun.rpc.request.clearAllTrash({});
    },
    scanUnlinkedNotes: async () => {
      const electrobun = await getElectrobun();
      if (!electrobun?.rpc) {
        return [];
      }
      const result = await electrobun.rpc.request.scanUnlinkedNotes({});
      return result.entries;
    },
    deleteUnlinkedNotes: async (files) => {
      const electrobun = await getElectrobun();
      if (!electrobun?.rpc) {
        return { deleted: [], skipped: files };
      }
      return await electrobun.rpc.request.deleteUnlinkedNotes({ files });
    },
    getWorkspaceInfo: async () => {
      const electrobun = await getElectrobun();
      if (!electrobun?.rpc) {
        return STUB_WORKSPACE;
      }
      return await electrobun.rpc.request.getWorkspaceInfo({});
    },
    openWorkspaceFolder: async () => {
      const electrobun = await getElectrobun();
      if (!electrobun?.rpc) {
        return { success: false };
      }
      return await electrobun.rpc.request.openWorkspaceFolder({});
    },
    switchWorkspace: async () => {
      const electrobun = await getElectrobun();
      if (!electrobun?.rpc) {
        return { success: false };
      }
      return await electrobun.rpc.request.switchWorkspace({});
    },
    exportWorkspaceArchive: async () => {
      const electrobun = await getElectrobun();
      if (!electrobun?.rpc) {
        return { success: false };
      }
      return await electrobun.rpc.request.exportWorkspaceArchive({});
    },
    getAppInfo: async () => {
      const electrobun = await getElectrobun();
      if (!electrobun?.rpc) {
        return STUB_APP_INFO;
      }
      return await electrobun.rpc.request.getAppInfo({});
    },
    checkForUpdate: async () => {
      const electrobun = await getElectrobun();
      if (!electrobun?.rpc) {
        return {
          currentHash: '',
          hash: '',
          updateAvailable: false,
          version: '',
          error: 'RPC unavailable',
        };
      }
      return await electrobun.rpc.request.checkForUpdate({});
    },
  };
}
