export type ThemeSetting = 'dark' | 'light' | 'system';
export type LocaleSetting = 'en' | 'zh';
export type DefaultLayoutMode = 'canvas' | 'document';

export interface AppSettings {
  defaultLayoutMode: DefaultLayoutMode;
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

export interface SettingsClient {
  deleteUnlinkedNotes: (
    files: string[]
  ) => Promise<{ deleted: string[]; skipped: string[] }>;
  getSettings: () => Promise<AppSettings>;
  listTrash: () => Promise<TrashEntry[]>;
  purgeTrash: (trashId: string) => Promise<{ success: boolean }>;
  restoreTrash: (trashId: string) => Promise<{ success: boolean }>;
  saveSettings: (settings: AppSettings) => Promise<{ success: boolean }>;
  scanUnlinkedNotes: () => Promise<UnlinkedFileEntry[]>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  locale: 'en',
  defaultLayoutMode: 'canvas',
};

interface SettingsRPC {
  bun: {
    requests: {
      getSettings: {
        params: Record<string, unknown>;
        response: AppSettings;
      };
      saveSettings: {
        params: AppSettings;
        response: { success: boolean };
      };
      listTrash: {
        params: Record<string, unknown>;
        response: TrashEntry[];
      };
      restoreTrash: {
        params: { trashId: string };
        response: { success: boolean };
      };
      purgeTrash: {
        params: { trashId: string };
        response: { success: boolean };
      };
      scanUnlinkedNotes: {
        params: Record<string, unknown>;
        response: { entries: UnlinkedFileEntry[] };
      };
      deleteUnlinkedNotes: {
        params: { files: string[] };
        response: { deleted: string[]; skipped: string[] };
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
      deleteUnlinkedNotes: (params: {
        files: string[];
      }) => Promise<{ deleted: string[]; skipped: string[] }>;
      getSettings: (params: Record<string, unknown>) => Promise<AppSettings>;
      listTrash: (params: Record<string, unknown>) => Promise<TrashEntry[]>;
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
  };
}
