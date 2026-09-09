import type {
  PluginContributionKind,
  PluginPermissionDeclaration,
} from './manifest';

export interface PluginSourceSummary {
  kind: 'file' | 'url' | 'zip';
  label: string;
}

export interface PluginCommandSummary {
  id: string;
  name: string;
  when?: string;
}

export interface PluginPackageSummary {
  author?: string;
  commands: PluginCommandSummary[];
  contributionKinds: PluginContributionKind[];
  description?: string;
  hostApi: string;
  id: string;
  name: string;
  permissions: {
    optional: PluginPermissionDeclaration[];
    required: PluginPermissionDeclaration[];
  };
  version: string;
}

export interface PluginCommandActivationSummary {
  enabled: boolean;
  grantedPermissions: string[];
}

export interface PluginInstallPreview {
  digest: string;
  plugin: PluginPackageSummary;
  source: PluginSourceSummary;
  transactionId: string;
}

export interface InstalledPluginSummary {
  commandActivation?: PluginCommandActivationSummary;
  digest: string;
  installedAt: string;
  name: string;
  plugin?: PluginPackageSummary;
  pluginId: string;
  source: PluginSourceSummary;
  status: 'invalid' | 'stored';
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
