import type { PluginCapability } from './manifest';

export interface PluginSourceSummary {
  kind: 'directory' | 'file' | 'url' | 'zip';
  label: string;
}

export interface PluginPackageSummary {
  author?: string;
  capabilities: PluginCapability[];
  description?: string;
  ghostboard: string;
  id: string;
  name: string;
  signatureStatus: 'unverified';
  updateUrl?: string;
  version: string;
}

export interface PluginInstallPreview {
  digest: string;
  plugin: PluginPackageSummary;
  source: PluginSourceSummary;
  transactionId: string;
}

export interface InstalledPluginSummary {
  development?: boolean;
  digest: string;
  enabled: boolean;
  installedAt: string;
  name: string;
  plugin?: PluginPackageSummary;
  pluginId: string;
  source: PluginSourceSummary;
  status: 'invalid' | 'legacy' | 'stored';
  /** Canonical digest of the installed tree; absent for development sources. */
  treeDigest?: string;
  validationError?: string;
  version: string;
}

export type PluginInstallPreparationResult =
  | { cancelled: true; success: false }
  | { error: string; success: false }
  | { preview: PluginInstallPreview; success: true };

export type PluginInstallCommitResult =
  | { error: string; success: false }
  | { plugin: InstalledPluginSummary; success: true };
