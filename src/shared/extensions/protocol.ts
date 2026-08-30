import type { ExtensionPresentation } from './presentation';

export type HostCapability =
  | 'assets'
  | 'scheduler'
  | 'notifications'
  | 'external'
  | 'network';

export type ExtensionAvailability = 'available' | 'disabled' | 'unknown';

export type ExtensionHistoryMode = 'record' | 'ephemeral';

export interface Size {
  height: number;
  width: number;
}

export interface ExtensionNodeData {
  canvasTypeId: string;
  instanceId: string;
  [key: string]: unknown;
}

export interface ExtensionFolderChild {
  data: ExtensionNodeData;
  id: string;
  size: Size;
  type: 'extension';
}

export interface ExtensionStateSnapshot {
  presentation: ExtensionPresentation;
  revision: number;
  state: unknown;
}

export interface ExtensionStateUpdate {
  expectedRevision?: number;
  history: ExtensionHistoryMode;
  state: unknown;
}

export interface SurfaceRenderContext {
  height: number;
  locale: string;
  readOnly: boolean;
  selected: boolean;
  surface: 'canvas' | 'detail' | 'preview';
  theme: 'light' | 'dark';
  width: number;
}

export interface AssetHandle {
  id: string;
}

export interface AssetMetadata {
  archiveSummary?: { entryCount: number; topFiles: string[] };
  duration?: number;
  kind?: 'audio' | 'file' | 'image' | 'video';
  mimeType: string;
  name: string;
  previewExcerpt?: string;
  size: number;
  thumbnailId?: string;
  waveform?: number[];
}

export interface AssetImportOptions {
  accept?: string;
}

export interface ScheduledTask {
  fireAt: string;
  id: string;
  payload?: unknown;
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
}

export interface ExtensionNotification {
  body?: string;
  title: string;
}

export interface ExtensionFetchRequest {
  url: string;
}

export interface ExtensionFetchResponse {
  body: string;
  status: number;
}

/**
 * Process-in-host API. Method shapes stay serializable for a future sandbox
 * bridge (RFC-2). Phase 1 only uses `instance` and a subset of `canvas`.
 */
export interface GhostBoardHostAPI {
  assets: {
    getMetadata(assetId: string): Promise<AssetMetadata>;
    getUrl(assetId: string): Promise<string>;
    importFile(options?: AssetImportOptions): Promise<AssetHandle | null>;
    remove(assetId: string): Promise<void>;
    reveal(assetId: string): Promise<void>;
  };
  canvas: {
    closeDetail(): Promise<void>;
    openDetail(): Promise<void>;
    requestResize(size: Partial<Size>): Promise<Size>;
    requestTitleEdit(): Promise<void>;
  };
  external: {
    openUrl(url: string): Promise<void>;
  };
  instance: {
    getState(): ExtensionStateSnapshot;
    updateState(request: ExtensionStateUpdate): Promise<ExtensionStateSnapshot>;
  };
  network: {
    fetch(request: ExtensionFetchRequest): Promise<ExtensionFetchResponse>;
  };
  notifications: {
    show(notification: ExtensionNotification): Promise<void>;
  };
  scheduler: {
    cancel(taskId: string): Promise<void>;
    list(): Promise<ScheduledTask[]>;
    schedule(task: ScheduledTask): Promise<void>;
  };
}

export interface ExtensionSearchMetadata {
  availability: ExtensionAvailability;
  canvasTypeId: string;
  instanceId: string;
}
