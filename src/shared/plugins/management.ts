import type { PluginCapability } from './manifest';

export type PluginSafeModeReason =
  | 'explicit'
  | 'previous-startup-incomplete'
  | 'startup-state-damaged';

export interface PluginSafeModeState {
  active: boolean;
  nextStart: 'normal' | 'safe-mode';
  reason?: PluginSafeModeReason;
}

export type PluginSafeModePreparationResult =
  | { error: string; success: false }
  | { safeMode: PluginSafeModeState; success: true };

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
  signatureStatus: 'unsigned' | 'verified';
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
  /** Restorable instance preimages created before dataVersion migrations. */
  migrationBackupCount?: number;
  name: string;
  /** Binding for remembered permissions; does not authenticate a real-world author. */
  permissionIdentity?: string;
  plugin?: PluginPackageSummary;
  pluginId: string;
  /** The one retained, verified code version available for explicit rollback. */
  previousVersion?: string;
  source: PluginSourceSummary;
  status: 'invalid' | 'legacy' | 'stored';
  /** Canonical digest of the installed tree; absent for development sources. */
  treeDigest?: string;
  validationError?: string;
  version: string;
}

export interface PluginUpdatePreview extends PluginInstallPreview {
  currentVersion: string;
  notes?: string;
}

export type PluginInstallPreparationResult =
  | { cancelled: true; success: false }
  | { error: string; success: false }
  | { preview: PluginInstallPreview; success: true };

export type PluginInstallCommitResult =
  | { error: string; success: false }
  | { plugin: InstalledPluginSummary; success: true };

export type PluginUpdatePreparationResult =
  | { error: string; success: false }
  | { preview: PluginUpdatePreview; success: true };

export type PluginMigrationRestoreResult =
  | { error: string; success: false }
  | { restored: number; skipped: number; success: true };
