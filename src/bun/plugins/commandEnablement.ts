import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const PLUGIN_COMMAND_GRANTS_FILE = 'plugin-command-grants.json';
const PLUGIN_COMMAND_GRANTS_SCHEMA = 1;

interface CommandGrant {
  digest: string;
  enabledAt: string;
  grantedPermissions: string[];
  packageFingerprint: string;
  version: string;
}

interface CommandGrantFile {
  schema: typeof PLUGIN_COMMAND_GRANTS_SCHEMA;
  workspaces: Record<string, Record<string, CommandGrant>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseGrant(value: unknown): CommandGrant | undefined {
  if (
    !isRecord(value) ||
    typeof value.digest !== 'string' ||
    typeof value.enabledAt !== 'string' ||
    typeof value.packageFingerprint !== 'string' ||
    typeof value.version !== 'string' ||
    !Array.isArray(value.grantedPermissions) ||
    !value.grantedPermissions.every(
      (permission) => typeof permission === 'string'
    )
  ) {
    return;
  }
  return {
    digest: value.digest,
    enabledAt: value.enabledAt,
    grantedPermissions: [...new Set(value.grantedPermissions)].sort(),
    packageFingerprint: value.packageFingerprint,
    version: value.version,
  };
}

function parseFile(value: unknown): CommandGrantFile {
  if (
    !isRecord(value) ||
    value.schema !== PLUGIN_COMMAND_GRANTS_SCHEMA ||
    !isRecord(value.workspaces)
  ) {
    return { schema: PLUGIN_COMMAND_GRANTS_SCHEMA, workspaces: {} };
  }

  const workspaces: Record<string, Record<string, CommandGrant>> = {};
  for (const [workspaceKey, candidate] of Object.entries(value.workspaces)) {
    if (!isRecord(candidate)) {
      continue;
    }
    const grants: Record<string, CommandGrant> = {};
    for (const [pluginId, grant] of Object.entries(candidate)) {
      const parsed = parseGrant(grant);
      if (parsed) {
        grants[pluginId] = parsed;
      }
    }
    if (Object.keys(grants).length > 0) {
      workspaces[workspaceKey] = grants;
    }
  }
  return { schema: PLUGIN_COMMAND_GRANTS_SCHEMA, workspaces };
}

async function readGrantFile(filePath: string): Promise<CommandGrantFile> {
  try {
    return parseFile(JSON.parse(await readFile(filePath, 'utf8')) as unknown);
  } catch {
    return { schema: PLUGIN_COMMAND_GRANTS_SCHEMA, workspaces: {} };
  }
}

async function writeGrantFile(filePath: string, value: CommandGrantFile) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(tempPath, filePath);
  await chmod(filePath, 0o600);
}

export function pluginCommandWorkspaceKey(workspacePath: string): string {
  return createHash('sha256').update(resolve(workspacePath)).digest('hex');
}

/**
 * App-local, workspace-bound authorization state for third-party commands.
 *
 * The workspace path is represented only by a SHA-256 digest. A copied or
 * moved workspace receives a different key and therefore cannot inherit a
 * previous grant from its source workspace.
 */
export class PluginCommandGrantStore {
  private readonly appDataRoot?: string;
  private readonly workspaceKey: string;

  constructor(input: { appDataRoot?: string; workspacePath: string }) {
    this.appDataRoot = input.appDataRoot;
    this.workspaceKey = pluginCommandWorkspaceKey(input.workspacePath);
  }

  async get(input: {
    digest: string;
    packageFingerprint: string;
    pluginId: string;
    version: string;
  }): Promise<string[] | undefined> {
    const file = await readGrantFile(await this.grantFilePath());
    const grant = file.workspaces[this.workspaceKey]?.[input.pluginId];
    if (
      !grant ||
      grant.digest !== input.digest ||
      grant.packageFingerprint !== input.packageFingerprint ||
      grant.version !== input.version
    ) {
      return;
    }
    return [...grant.grantedPermissions];
  }

  async enable(input: {
    digest: string;
    grantedPermissions: Iterable<string>;
    packageFingerprint: string;
    pluginId: string;
    version: string;
  }): Promise<string[]> {
    const filePath = await this.grantFilePath();
    const file = await readGrantFile(filePath);
    const grants = file.workspaces[this.workspaceKey] ?? {};
    const grantedPermissions = [...new Set(input.grantedPermissions)].sort();
    grants[input.pluginId] = {
      digest: input.digest,
      enabledAt: new Date().toISOString(),
      grantedPermissions,
      packageFingerprint: input.packageFingerprint,
      version: input.version,
    };
    file.workspaces[this.workspaceKey] = grants;
    await writeGrantFile(filePath, file);
    return grantedPermissions;
  }

  async disable(pluginId: string): Promise<boolean> {
    const filePath = await this.grantFilePath();
    const file = await readGrantFile(filePath);
    const grants = file.workspaces[this.workspaceKey];
    if (!grants?.[pluginId]) {
      return false;
    }
    delete grants[pluginId];
    if (Object.keys(grants).length === 0) {
      delete file.workspaces[this.workspaceKey];
    }
    await writeGrantFile(filePath, file);
    return true;
  }

  private async grantFilePath(): Promise<string> {
    if (this.appDataRoot) {
      return join(this.appDataRoot, PLUGIN_COMMAND_GRANTS_FILE);
    }
    const { getAppDataRoot } = await import('../appPaths');
    return join(getAppDataRoot(), PLUGIN_COMMAND_GRANTS_FILE);
  }
}
