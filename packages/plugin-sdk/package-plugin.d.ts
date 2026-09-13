export interface PluginPackageBuildOptions {
  includes?: string[];
  output?: string;
  privateKey?: string;
  source: string;
}

export interface PluginPackageBuildResult {
  archive: string;
  bytes: number;
  entries: string[];
  pluginId: string;
  sha256: string;
  signatureStatus: 'signed' | 'unsigned';
  signingTreeSha256?: string;
  version: string;
}

export interface PluginSigningKeyResult {
  privateKey: string;
  publicKey: string;
}

export function buildPluginPackage(
  options: PluginPackageBuildOptions
): Promise<PluginPackageBuildResult>;

export function generateSigningKey(
  outputPath: string
): Promise<PluginSigningKeyResult>;
