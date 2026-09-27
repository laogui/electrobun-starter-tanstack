import {
  rpcCheckForUpdate,
  rpcClearAllTrash,
  rpcDeleteUnlinkedNotes,
  rpcExportWorkspaceArchive,
  rpcGetAICredentialStatus,
  rpcGetAppInfo,
  rpcGetSettings,
  rpcGetWorkspaceInfo,
  rpcListTrash,
  rpcOpenWorkspaceFolder,
  rpcPurgeTrash,
  rpcRestoreTrash,
  rpcSaveSettings,
  rpcScanUnlinkedNotes,
  rpcSetAIApiKey,
  rpcSwitchWorkspace,
} from '@/lib/rpc';

export type ThemeSetting = 'dark' | 'light' | 'system';
export type LocaleSetting = 'en' | 'zh';
export type FontFamilySetting = 'mono' | 'serif' | 'system';
/** Named preset id, or a custom `#RRGGBB` / `#RRGGBBAA` hex color. */
export type CanvasBackgroundSetting = string;

export const AUTO_SAVE_INTERVAL_OPTIONS = [500, 800, 2000, 5000] as const;
export type AutoSaveIntervalSetting =
  (typeof AUTO_SAVE_INTERVAL_OPTIONS)[number];

export const AI_PROVIDER_OPTIONS = [
  'openai',
  'anthropic',
  'ollama',
  'custom',
] as const;
export type AIProviderSetting = (typeof AI_PROVIDER_OPTIONS)[number];

export interface AppSettings {
  aiBaseUrl: string;
  aiEnabled: boolean;
  aiModel: string;
  aiProvider: AIProviderSetting;
  autoSaveInterval: AutoSaveIntervalSetting;
  canvasBackground: CanvasBackgroundSetting;
  canvasShowMinimap: boolean;
  canvasSnapToGrid: boolean;
  fontFamily: FontFamilySetting;
  locale: LocaleSetting;
  theme: ThemeSetting;
}

export interface AICredentialStatus {
  hasApiKey: boolean;
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
  getAICredentialStatus: () => Promise<AICredentialStatus>;
  getAppInfo: () => Promise<AppInfo>;
  getSettings: () => Promise<AppSettings>;
  getWorkspaceInfo: () => Promise<WorkspaceInfo>;
  listTrash: () => Promise<TrashEntry[]>;
  openWorkspaceFolder: () => Promise<{ success: boolean }>;
  purgeTrash: (trashId: string) => Promise<{ success: boolean }>;
  restoreTrash: (trashId: string) => Promise<{ success: boolean }>;
  saveSettings: (settings: AppSettings) => Promise<{ success: boolean }>;
  scanUnlinkedNotes: () => Promise<UnlinkedFileEntry[]>;
  setAIApiKey: (apiKey: string | null) => Promise<{ success: boolean }>;
  switchWorkspace: () => Promise<SwitchWorkspaceResult>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  locale: 'en',
  fontFamily: 'system',
  canvasBackground: 'default',
  canvasShowMinimap: false,
  canvasSnapToGrid: true,
  autoSaveInterval: 800,
  aiEnabled: false,
  aiProvider: 'openai',
  aiModel: 'gpt-4.1-mini',
  aiBaseUrl: '',
};

export const TRASH_UPDATED_EVENT = 'trash-updated';

export function createSettingsClient(): SettingsClient {
  return {
    getSettings: async () => (await rpcGetSettings()) ?? DEFAULT_SETTINGS,
    saveSettings: rpcSaveSettings,
    listTrash: rpcListTrash,
    restoreTrash: rpcRestoreTrash,
    purgeTrash: rpcPurgeTrash,
    clearAllTrash: rpcClearAllTrash,
    scanUnlinkedNotes: rpcScanUnlinkedNotes,
    deleteUnlinkedNotes: rpcDeleteUnlinkedNotes,
    getWorkspaceInfo: rpcGetWorkspaceInfo,
    openWorkspaceFolder: rpcOpenWorkspaceFolder,
    switchWorkspace: rpcSwitchWorkspace,
    exportWorkspaceArchive: rpcExportWorkspaceArchive,
    getAppInfo: rpcGetAppInfo,
    checkForUpdate: rpcCheckForUpdate,
    getAICredentialStatus: rpcGetAICredentialStatus,
    setAIApiKey: rpcSetAIApiKey,
  };
}
