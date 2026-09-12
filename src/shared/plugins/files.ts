export const PLUGIN_TEXT_FILE_MAX_BYTES = 1024 * 1024;
export const PLUGIN_COLLECTED_FILE_MAX_BYTES = 16 * 1024 * 1024;
export const PLUGIN_FILE_TRANSFER_CHUNK_BYTES = 1024 * 1024;
export const PLUGIN_FILE_TRANSFER_MAX_BYTES = 256 * 1024 * 1024;
export const PLUGIN_DIRECTORY_PAGE_MAX_ENTRIES = 100;

export interface PluginFileContext {
  activationId: string;
  pluginId: string;
  workspaceId: string;
}

export interface PluginDirectoryHandleData {
  id: string;
  kind: 'directory';
  name: string;
}

export interface PluginFileHandleData {
  id: string;
  kind: 'file';
  lastModified: number;
  mimeType: string;
  name: string;
  size: number;
}

export type PluginFileSystemHandleData =
  | PluginDirectoryHandleData
  | PluginFileHandleData;

export interface PluginFilePickRequest extends PluginFileContext {
  extensions: string[];
  kind?: 'directory' | 'file';
  multiple?: boolean;
}

export interface PluginFileReadRequest extends PluginFileContext {
  handleId: string;
}

export interface PluginFileReleaseRequest extends PluginFileContext {
  handleIds: string[];
}

export interface PluginDirectoryListRequest extends PluginFileContext {
  cursor?: string;
  handleId: string;
  limit?: number;
}

export interface PluginDirectoryEntryData {
  handle?: PluginFileSystemHandleData;
  kind: 'directory' | 'file' | 'symlink';
  name: string;
}

export type PluginDirectoryListResult =
  | { error: string; success: false }
  | {
      entries: PluginDirectoryEntryData[];
      nextCursor: string | null;
      success: true;
    };

export type PluginFilePickResult =
  | { cancelled: true; success: false }
  | { error: string; success: false }
  | { files: PluginFileSystemHandleData[]; success: true };

export type PluginFileReadResult =
  | { error: string; success: false }
  | { success: true; text: string };
