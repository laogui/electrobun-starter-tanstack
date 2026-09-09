import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import type {
  InstalledPluginSummary,
  PluginCommandActivationSummary,
  PluginCommandSummary,
  PluginInstallPreview,
  PluginPackageSummary,
  PluginSourceSummary,
} from '../../shared/plugins/management';
import {
  listContributionKinds,
  type PluginManifest,
} from '../../shared/plugins/manifest';
import { PluginCommandGrantStore } from './commandEnablement';
import {
  type LoadedPluginDirectory,
  loadPluginDirectory,
} from './loadDirectory';
import { runPluginCommandOnWorkspaceNotes } from './noteTitleCommand';
import {
  type InstalledPluginPackage,
  PluginInstallError,
  type PluginInstallSource,
  PluginInstallStore,
} from './pluginInstall';

const PLUGIN_DIRECTORY = join('.ghostboard', 'plugins');
const PACKAGE_EXTENSIONS = new Set(['.zip', '.ghostboard-plugin']);

export interface EnabledPluginCommand {
  commandId: string;
  commandName: string;
  pluginId: string;
  pluginName: string;
}

export function pluginInstallRoot(workspacePath: string): string {
  return join(workspacePath, PLUGIN_DIRECTORY);
}

export function pluginInstallErrorMessage(error: unknown): string {
  if (error instanceof PluginInstallError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Plugin installation failed.';
}

function sourceSummary(source: PluginInstallSource): PluginSourceSummary {
  switch (source.kind) {
    case 'file':
      return { kind: 'file', label: source.name };
    case 'url':
      return { kind: 'url', label: `${source.origin}${source.path}` };
    default:
      return { kind: 'zip', label: 'Plugin package' };
  }
}

function packageSummary(manifest: PluginManifest): PluginPackageSummary {
  return {
    ...(manifest.author ? { author: manifest.author } : {}),
    ...(manifest.description ? { description: manifest.description } : {}),
    commands: manifest.contributes.commands.map(
      (command): PluginCommandSummary => ({
        id: command.id,
        name: command.name,
        ...(command.when ? { when: command.when } : {}),
      })
    ),
    contributionKinds: listContributionKinds(manifest),
    hostApi: manifest.engines.hostApi,
    id: manifest.id,
    name: manifest.name,
    permissions: {
      optional: manifest.permissions.optional,
      required: manifest.permissions.required,
    },
    version: manifest.version,
  };
}

function packageFingerprint(loaded: LoadedPluginDirectory): string {
  const sources = Object.fromEntries(
    Object.entries(loaded.sources).sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );
  return createHash('sha256')
    .update(JSON.stringify({ manifest: loaded.manifest, sources }))
    .digest('hex');
}

function previewFromPrepared(input: {
  digest: string;
  manifest: PluginManifest;
  source: PluginInstallSource;
  transactionId: string;
}): PluginInstallPreview {
  return {
    digest: input.digest,
    plugin: packageSummary(input.manifest),
    source: sourceSummary(input.source),
    transactionId: input.transactionId,
  };
}

async function installedSummary(
  installed: InstalledPluginPackage,
  commandGrants: PluginCommandGrantStore
): Promise<InstalledPluginSummary> {
  const base = {
    digest: installed.digest,
    installedAt: installed.installedAt,
    name: installed.name,
    pluginId: installed.pluginId,
    source: sourceSummary(installed.source),
    version: installed.version,
  };
  try {
    const loaded = await loadPluginDirectory(installed.directory);
    if (
      loaded.manifest.id !== installed.pluginId ||
      loaded.manifest.version !== installed.version
    ) {
      throw new PluginInstallError(
        'invalid-package',
        `Stored plugin metadata does not match its package: ${installed.pluginId}`
      );
    }
    const grantedPermissions = await commandGrants.get({
      digest: installed.digest,
      packageFingerprint: packageFingerprint(loaded),
      pluginId: loaded.manifest.id,
      version: loaded.manifest.version,
    });
    const commandActivation: PluginCommandActivationSummary | undefined =
      loaded.manifest.contributes.commands.length > 0
        ? {
            enabled: grantedPermissions !== undefined,
            grantedPermissions: grantedPermissions ?? [],
          }
        : undefined;
    return {
      ...base,
      name: loaded.manifest.name,
      plugin: packageSummary(loaded.manifest),
      ...(commandActivation ? { commandActivation } : {}),
      status: 'stored',
    };
  } catch (error) {
    return {
      ...base,
      status: 'invalid',
      validationError: pluginInstallErrorMessage(error),
    };
  }
}

export class PluginManagementService {
  private readonly commandGrants: PluginCommandGrantStore;
  private readonly store: PluginInstallStore;
  private readonly workspacePath: string;

  constructor(workspacePath: string, options?: { appDataRoot?: string }) {
    this.workspacePath = workspacePath;
    this.store = new PluginInstallStore(pluginInstallRoot(workspacePath));
    this.commandGrants = new PluginCommandGrantStore({
      appDataRoot: options?.appDataRoot,
      workspacePath,
    });
  }

  async recover(): Promise<void> {
    await this.store.recover();
  }

  async list(): Promise<InstalledPluginSummary[]> {
    const installed = await this.store.listInstalled();
    return await Promise.all(
      installed.map((entry) => installedSummary(entry, this.commandGrants))
    );
  }

  async prepareFromFile(filePath: string): Promise<PluginInstallPreview> {
    const name = basename(filePath);
    if (!PACKAGE_EXTENSIONS.has(extname(name).toLowerCase())) {
      throw new PluginInstallError(
        'invalid-package',
        'Choose a .zip or .ghostboard-plugin package.'
      );
    }
    const prepared = await this.store.prepareFromZip({
      source: { kind: 'file', name },
      zipBytes: Uint8Array.from(await readFile(filePath)),
    });
    return previewFromPrepared({
      digest: prepared.digest,
      manifest: prepared.manifest,
      source: prepared.journal.source,
      transactionId: prepared.transactionId,
    });
  }

  async prepareFromUrl(url: string): Promise<PluginInstallPreview> {
    const prepared = await this.store.prepareFromUrl({ url });
    return previewFromPrepared({
      digest: prepared.digest,
      manifest: prepared.manifest,
      source: prepared.journal.source,
      transactionId: prepared.transactionId,
    });
  }

  async commit(transactionId: string): Promise<InstalledPluginSummary> {
    return await installedSummary(
      await this.store.commit(transactionId),
      this.commandGrants
    );
  }

  async cancel(transactionId: string): Promise<void> {
    await this.store.cancel(transactionId);
  }

  async enableCommands(input: {
    digest: string;
    pluginId: string;
  }): Promise<InstalledPluginSummary> {
    const resolved = await this.resolveStoredPackage(input);
    const requiredPermissions =
      resolved.loaded.manifest.permissions.required.map(
        (permission) => permission.id
      );
    await this.commandGrants.enable({
      digest: resolved.installed.digest,
      grantedPermissions: requiredPermissions,
      packageFingerprint: packageFingerprint(resolved.loaded),
      pluginId: resolved.loaded.manifest.id,
      version: resolved.loaded.manifest.version,
    });
    return await installedSummary(resolved.installed, this.commandGrants);
  }

  async disableCommands(input: {
    digest: string;
    pluginId: string;
  }): Promise<InstalledPluginSummary> {
    const resolved = await this.resolveStoredPackage(input);
    await this.commandGrants.disable(resolved.loaded.manifest.id);
    return await installedSummary(resolved.installed, this.commandGrants);
  }

  async listEnabledCommands(): Promise<EnabledPluginCommand[]> {
    const installed = await this.store.listInstalled();
    const commands: EnabledPluginCommand[] = [];
    for (const entry of installed) {
      try {
        const loaded = await loadPluginDirectory(entry.directory);
        if (
          loaded.manifest.id !== entry.pluginId ||
          loaded.manifest.version !== entry.version
        ) {
          continue;
        }
        const grants = await this.commandGrants.get({
          digest: entry.digest,
          packageFingerprint: packageFingerprint(loaded),
          pluginId: loaded.manifest.id,
          version: loaded.manifest.version,
        });
        if (grants === undefined) {
          continue;
        }
        for (const command of loaded.manifest.contributes.commands) {
          commands.push({
            commandId: command.id,
            commandName: command.name,
            pluginId: loaded.manifest.id,
            pluginName: loaded.manifest.name,
          });
        }
      } catch {
        // A tampered or unavailable package cannot retain a runnable menu entry.
      }
    }
    return commands;
  }

  async runEnabledCommand(input: {
    commandId: string;
    noteIds: string[];
    pluginId: string;
  }): Promise<{ operationId: string; titles: Record<string, string> }> {
    const resolved = await this.resolveStoredPackage(input);
    if (
      !resolved.loaded.manifest.contributes.commands.some(
        (command) => command.id === input.commandId
      )
    ) {
      throw new PluginInstallError(
        'not-found',
        `Plugin command is not available: ${input.commandId}`
      );
    }
    const grants = await this.commandGrants.get({
      digest: resolved.installed.digest,
      packageFingerprint: packageFingerprint(resolved.loaded),
      pluginId: resolved.loaded.manifest.id,
      version: resolved.loaded.manifest.version,
    });
    if (grants === undefined) {
      throw new PluginInstallError(
        'invalid-state',
        `Plugin commands are not enabled: ${input.pluginId}`
      );
    }
    return await runPluginCommandOnWorkspaceNotes({
      commandId: input.commandId,
      grantedPermissions: grants,
      loaded: resolved.loaded,
      noteIds: input.noteIds,
      workspacePath: this.workspacePath,
    });
  }

  private async resolveStoredPackage(input: {
    digest?: string;
    pluginId: string;
  }): Promise<{
    installed: InstalledPluginPackage;
    loaded: Awaited<ReturnType<typeof loadPluginDirectory>>;
  }> {
    const installed = (await this.store.listInstalled()).find(
      (entry) =>
        entry.pluginId === input.pluginId &&
        (input.digest === undefined || entry.digest === input.digest)
    );
    if (!installed) {
      throw new PluginInstallError(
        'not-found',
        `Stored plugin is not available: ${input.pluginId}`
      );
    }
    const loaded = await loadPluginDirectory(installed.directory);
    if (
      loaded.manifest.id !== installed.pluginId ||
      loaded.manifest.version !== installed.version
    ) {
      throw new PluginInstallError(
        'invalid-package',
        `Stored plugin metadata does not match its package: ${input.pluginId}`
      );
    }
    return { installed, loaded };
  }
}
