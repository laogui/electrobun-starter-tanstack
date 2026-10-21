export interface PluginRuntimeDescriptor {
  development: boolean;
  entryUrl: string;
  generation: string;
  /**
   * Per-plugin bearer token for SDK host services (storage, content, files).
   * Scoped to this plugin id; it cannot reach renderer-only routes such as
   * AI chat or attachments. Optional so older hosts/harnesses still parse.
   */
  hostToken?: string;
  name: string;
  pluginId: string;
  version: string;
}

export interface PluginHostDiagnostic {
  message: string;
  pluginId: string;
}

export interface PluginRuntimeSnapshot {
  diagnostics: PluginHostDiagnostic[];
  plugins: PluginRuntimeDescriptor[];
  workspaceId: string;
}
