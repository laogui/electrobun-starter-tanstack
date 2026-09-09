export interface PluginRuntimeDescriptor {
  development: boolean;
  entryUrl: string;
  generation: string;
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
