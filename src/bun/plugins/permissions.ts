import { join } from 'node:path';
import { z } from 'zod';

import { atomicWrite } from '../atomicWrite';
import { readJsonOrEmpty } from '../persistence/corruptFile';

/**
 * Main-process consent for sensitive plugin operations.
 *
 * Trusted plugins share the renderer's JS realm, so a confirmation drawn by
 * the renderer can be skipped by plugin code. These checks run in the Bun
 * process instead and ask through a native dialog (see `permissionPrompt.ts`).
 *
 * Grants are per plugin and per permission. Only the native dialog creates a
 * standing grant: there is deliberately no RPC that grants, so renderer-realm
 * code can list or revoke grants but never add one.
 */

export const PLUGIN_PERMISSIONS = [
  'files.read',
  'files.directory',
  'content.delete',
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

/** User-facing description used by the native prompt. */
export const PLUGIN_PERMISSION_DESCRIPTIONS: Record<PluginPermission, string> =
  {
    'files.read': 'open and read files you choose from your computer',
    'files.directory':
      'list, read and write files inside a folder you choose on your computer',
    'content.delete': 'delete several notes from your workspace at once',
  };

/** What the user picked in the prompt. */
export type PluginPermissionDecision = 'allow-once' | 'always-allow' | 'deny';

export interface PluginPermissionPromptInput {
  detail?: string;
  permission: PluginPermission;
  pluginId: string;
  pluginName: string;
}

export type PluginPermissionPrompter = (
  input: PluginPermissionPromptInput
) => Promise<PluginPermissionDecision>;

export class PluginPermissionDeniedError extends Error {
  readonly permission: PluginPermission;
  readonly pluginId: string;

  constructor(pluginId: string, permission: PluginPermission, reason: string) {
    super(`Plugin ${pluginId} was not allowed to ${permission}: ${reason}`);
    this.name = 'PluginPermissionDeniedError';
    this.permission = permission;
    this.pluginId = pluginId;
  }
}

const PERMISSIONS_FILE_SCHEMA = 'ghostboard-plugin-permissions/v1';
const PERMISSIONS_FILE_NAME = 'plugin-permissions.json';

const permissionSchema = z.enum(PLUGIN_PERMISSIONS);

const grantSchema = z.object({
  grantedAt: z.string(),
  permission: permissionSchema,
  pluginId: z.string().min(1).max(200),
});

const permissionsFileSchema = z.object({
  grants: z.array(grantSchema),
  schema: z.literal(PERMISSIONS_FILE_SCHEMA),
});

export type PluginPermissionGrant = z.infer<typeof grantSchema>;

function emptyFile(): z.infer<typeof permissionsFileSchema> {
  return { schema: PERMISSIONS_FILE_SCHEMA, grants: [] };
}

/** `<appDataRoot>/plugin-permissions.json`, written 0600. */
export class PluginPermissionStore {
  private readonly filePath: string;
  private grants: PluginPermissionGrant[] | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(appDataRoot: string) {
    this.filePath = join(appDataRoot, PERMISSIONS_FILE_NAME);
  }

  async list(): Promise<PluginPermissionGrant[]> {
    return [...(await this.load())];
  }

  async has(pluginId: string, permission: PluginPermission): Promise<boolean> {
    return (await this.load()).some(
      (grant) => grant.pluginId === pluginId && grant.permission === permission
    );
  }

  async grant(pluginId: string, permission: PluginPermission): Promise<void> {
    const grants = await this.load();
    if (
      grants.some(
        (grant) =>
          grant.pluginId === pluginId && grant.permission === permission
      )
    ) {
      return;
    }
    grants.push({ pluginId, permission, grantedAt: new Date().toISOString() });
    await this.persist();
  }

  /** Remove one permission, or every permission when none is given. */
  async revoke(pluginId: string, permission?: PluginPermission): Promise<void> {
    const grants = await this.load();
    const kept = grants.filter(
      (grant) =>
        grant.pluginId !== pluginId ||
        (permission !== undefined && grant.permission !== permission)
    );
    if (kept.length === grants.length) {
      return;
    }
    this.grants = kept;
    await this.persist();
  }

  private async load(): Promise<PluginPermissionGrant[]> {
    if (this.grants) {
      return this.grants;
    }
    // A damaged file is kept aside by readJsonOrEmpty and treated as "no
    // grants": failing closed only means the user is asked again.
    const read = await readJsonOrEmpty(this.filePath, (value) =>
      permissionsFileSchema.parse(value)
    );
    this.grants = read.kind === 'ok' ? [...read.value.grants] : [];
    return this.grants;
  }

  private persist(): Promise<void> {
    const snapshot = { ...emptyFile(), grants: [...(this.grants ?? [])] };
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(() =>
        atomicWrite(this.filePath, `${JSON.stringify(snapshot, null, 2)}\n`, {
          mode: 0o600,
        })
      );
    return this.writeChain;
  }
}

export interface PluginPermissionGateOptions {
  /**
   * Display name for an installed plugin, or undefined when the id is not an
   * installed plugin. Unknown ids are denied without prompting so a caller
   * cannot put an arbitrary name in front of the user.
   */
  describePlugin: (pluginId: string) => Promise<string | undefined>;
  /** Undefined when no native dialog is available: requests are denied. */
  prompt?: PluginPermissionPrompter;
  store: PluginPermissionStore;
}

/**
 * Decide whether `pluginId` may perform `permission` right now.
 *
 * - a stored "Always allow" grant allows without asking;
 * - otherwise the user is asked; concurrent requests for the same plugin and
 *   permission share one dialog, and dialogs are shown one at a time;
 * - "Deny" is remembered for the rest of this launch so a plugin cannot spam
 *   dialogs; it is not persisted, so the next launch asks again;
 * - no prompter, an unknown plugin, or a prompt failure all deny.
 */
export class PluginPermissionGate {
  private readonly options: PluginPermissionGateOptions;
  private readonly sessionDenied = new Set<string>();
  private readonly pending = new Map<string, Promise<boolean>>();
  private promptChain: Promise<unknown> = Promise.resolve();

  constructor(options: PluginPermissionGateOptions) {
    this.options = options;
  }

  /** Resolves true when allowed; never throws. */
  async check(
    pluginId: string,
    permission: PluginPermission,
    detail?: string
  ): Promise<boolean> {
    if (await this.hasGrant(pluginId, permission)) {
      return true;
    }
    const key = `${pluginId}\u0000${permission}`;
    if (this.sessionDenied.has(key)) {
      return false;
    }
    const existing = this.pending.get(key);
    if (existing) {
      return existing;
    }
    const decision = this.ask(pluginId, permission, key, detail).finally(() => {
      this.pending.delete(key);
    });
    this.pending.set(key, decision);
    return decision;
  }

  /** Like `check`, but throws `PluginPermissionDeniedError` when denied. */
  async require(
    pluginId: string,
    permission: PluginPermission,
    detail?: string
  ): Promise<void> {
    if (!(await this.check(pluginId, permission, detail))) {
      throw new PluginPermissionDeniedError(
        pluginId,
        permission,
        'permission denied'
      );
    }
  }

  list(): Promise<PluginPermissionGrant[]> {
    return this.options.store.list();
  }

  private async hasGrant(
    pluginId: string,
    permission: PluginPermission
  ): Promise<boolean> {
    try {
      return await this.options.store.has(pluginId, permission);
    } catch (error) {
      // Unreadable store: fall through to asking rather than allowing.
      console.warn('[plugins] Could not read permission grants:', error);
      return false;
    }
  }

  async revoke(pluginId: string, permission?: PluginPermission): Promise<void> {
    await this.options.store.revoke(pluginId, permission);
  }

  private async ask(
    pluginId: string,
    permission: PluginPermission,
    key: string,
    detail: string | undefined
  ): Promise<boolean> {
    const { prompt, describePlugin, store } = this.options;
    if (!prompt) {
      return false;
    }
    let pluginName: string | undefined;
    try {
      pluginName = await describePlugin(pluginId);
    } catch {
      pluginName = undefined;
    }
    if (!pluginName) {
      return false;
    }
    const name = pluginName;
    const run = this.promptChain.then(() =>
      prompt({ pluginId, pluginName: name, permission, detail })
    );
    this.promptChain = run.catch(() => undefined);
    let decision: PluginPermissionDecision;
    try {
      decision = await run;
    } catch (error) {
      console.warn('[plugins] Permission prompt failed:', error);
      return false;
    }
    if (decision === 'deny') {
      this.sessionDenied.add(key);
      return false;
    }
    if (decision === 'always-allow') {
      try {
        await store.grant(pluginId, permission);
      } catch (error) {
        // The user allowed it; failing to remember only means asking again.
        console.warn('[plugins] Could not persist permission grant:', error);
      }
    }
    return true;
  }
}

export function isPluginPermission(value: unknown): value is PluginPermission {
  return permissionSchema.safeParse(value).success;
}
