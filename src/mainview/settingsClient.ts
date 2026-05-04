export type ThemeSetting = 'dark' | 'light' | 'system';
export type LocaleSetting = 'en' | 'zh';
export type DefaultLayoutMode = 'canvas' | 'document';

export interface AppSettings {
  defaultLayoutMode: DefaultLayoutMode;
  locale: LocaleSetting;
  theme: ThemeSetting;
}

export interface SettingsClient {
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<{ success: boolean }>;
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
    };
    messages: Record<never, unknown>;
  };
  webview: {
    requests: Record<string, { params: unknown; response: unknown }>;
    messages: Record<never, unknown>;
  };
}

interface SettingsElectroview {
  rpc?: {
    request: {
      getSettings: (params: Record<string, unknown>) => Promise<AppSettings>;
      saveSettings: (params: AppSettings) => Promise<{ success: boolean }>;
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
        messages: {},
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
  };
}
