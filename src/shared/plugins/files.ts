export const PLUGIN_TEXT_FILE_MAX_BYTES = 1024 * 1024;

export interface PluginFileContext {
  activationId: string;
  pluginId: string;
  workspaceId: string;
}

export interface PluginFileHandleData {
  id: string;
  lastModified: number;
  mimeType: string;
  name: string;
  size: number;
}

export interface PluginFilePickRequest extends PluginFileContext {
  extensions: string[];
}

export interface PluginFileReadRequest extends PluginFileContext {
  handleId: string;
}

export interface PluginFileReleaseRequest extends PluginFileContext {
  handleIds: string[];
}

export type PluginFilePickResult =
  | { cancelled: true; success: false }
  | { error: string; success: false }
  | { files: PluginFileHandleData[]; success: true };

export type PluginFileReadResult =
  | { error: string; success: false }
  | { success: true; text: string };
