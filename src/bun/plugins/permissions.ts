import { join, resolve } from 'node:path';
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
const sharedStores = new Map<string, PluginPermissionStore>();
/** App services share cached grants so revocation is immediately visible. */
export function getPluginPermissionStore(
  appDataRoot: string
): PluginPermissionStore {
  const root = resolve(appDataRoot);
  let store = sharedStores.get(root);
  if (!store) {
    store = new PluginPermissionStore(root);
    sharedStores.set(root, store);
  }
  return store;
}

const permissionSchema = z.enum(PLUGIN_PERMISSIONS);

const grantSchema = z.object({
  identity: z.string().optional(),
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
  private loading: Promise<PluginPermissionGrant[]> | null = null;
  private mutations: Promise<void> = Promise.resolve();
  private writeChain: Promise<void> = Promise.resolve();
  private readonly revocations = new Map<string, number>();

  version(pluginId: string): number {
    return this.revocations.get(pluginId) ?? 0;
  }

  constructor(appDataRoot: string) {
    this.filePath = join(appDataRoot, PERMISSIONS_FILE_NAME);
  }

  async list(): Promise<PluginPermissionGrant[]> {
    await this.mutations.catch(() => undefined);
    return [...(await this.load())];
  }

  async has(
    pluginId: string,
    permission: PluginPermission,
    identity?: string
  ): Promise<boolean> {
    await this.mutations.catch(() => undefined);
    return (await this.load()).some(
      (grant) =>
        grant.pluginId === pluginId &&
        grant.permission === permission &&
        grant.identity === identity
    );
  }

  async grant(
    pluginId: string,
    permission: PluginPermission,
    identity?: string,
    expectedVersion?: number
  ): Promise<void> {
    return this.mutate(async () => {
      const grants = await this.load();
      if (
        expectedVersion !== undefined &&
        this.version(pluginId) !== expectedVersion
      ) {
        return;
      }
      if (
        grants.some(
          (grant) =>
            grant.pluginId === pluginId &&
            grant.permission === permission &&
            grant.identity === identity
        )
      ) {
        return;
      }
      this.grants = grants.filter(
        (grant) =>
          grant.pluginId !== pluginId || grant.permission !== permission
      );
      this.grants.push({
        pluginId,
        permission,
        ...(identity ? { identity } : {}),
        grantedAt: new Date().toISOString(),
      });
      await this.persist();
    });
  }

  /** Remove one permission, or every permission when none is given. */
  async revoke(pluginId: string, permission?: PluginPermission): Promise<void> {
    this.revocations.set(pluginId, this.version(pluginId) + 1);
    return this.mutate(async () => {
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
    });
  }

  private mutate(operation: () => Promise<void>): Promise<void> {
    const next = this.mutations.catch(() => undefined).then(operation);
    this.mutations = next;
    return next;
  }

  private async load(): Promise<PluginPermissionGrant[]> {
    if (this.grants) {
      return this.grants;
    }
    if (!this.loading) {
      this.loading = this.readGrants().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async readGrants(): Promise<PluginPermissionGrant[]> {
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
  describePlugin: (
    pluginId: string
  ) => Promise<string | { name: string; identity: string } | undefined>;
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
    const description = await this.describe(pluginId);
    if (!description) {
      return false;
    }
    const version = this.options.store.version(pluginId);
    if (await this.hasGrant(pluginId, permission, description.identity)) {
      return this.isCurrent(pluginId, description, version);
    }
    const key = `${pluginId}\u0000${permission}\u0000${description.identity ?? ''}\u0000${version}`;
    if (this.sessionDenied.has(key)) {
      return false;
    }
    const existing = this.pending.get(key);
    if (existing) {
      return existing;
    }
    const decision = this.ask(
      pluginId,
      permission,
      key,
      detail,
      description,
      version
    ).finally(() => {
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
    permission: PluginPermission,
    identity?: string
  ): Promise<boolean> {
    try {
      return await this.options.store.has(pluginId, permission, identity);
    } catch (error) {
      // Unreadable store: fall through to asking rather than allowing.
      console.warn('[plugins] Could not read permission grants:', error);
      return false;
    }
  }

  async revoke(pluginId: string, permission?: PluginPermission): Promise<void> {
    await this.options.store.revoke(pluginId, permission);
  }

  private async describe(
    pluginId: string
  ): Promise<{ name: string; identity?: string } | undefined> {
    try {
      const value = await this.options.describePlugin(pluginId);
      return typeof value === 'string' ? { name: value } : value;
    } catch {
      return;
    }
  }

  private async isCurrent(
    pluginId: string,
    description: { identity?: string },
    version: number
  ): Promise<boolean> {
    const value = await this.describe(pluginId);
    return (
      Boolean(value) &&
      value?.identity === description.identity &&
      this.options.store.version(pluginId) === version
    );
  }

  private async ask(
    pluginId: string,
    permission: PluginPermission,
    key: string,
    detail: string | undefined,
    description: { name: string; identity?: string },
    version: number
  ): Promise<boolean> {
    const { prompt, store } = this.options;
    if (!prompt) {
      return false;
    }
    const current = () => this.isCurrent(pluginId, description, version);
    const run = this.promptChain.then(async () =>
      (await current())
        ? prompt({ pluginId, pluginName: description.name, permission, detail })
        : 'deny'
    );
    this.promptChain = run.catch(() => undefined);
    let decision: PluginPermissionDecision;
    try {
      decision = await run;
    } catch (error) {
      console.warn('[plugins] Permission prompt failed:', error);
      return false;
    }
    if (!(await current())) {
      return false;
    }
    if (decision === 'deny') {
      this.sessionDenied.add(key);
      return false;
    }
    if (decision === 'always-allow') {
      try {
        await store.grant(pluginId, permission, description.identity, version);
      } catch (error) {
        // The user allowed it; failing to remember only means asking again.
        console.warn('[plugins] Could not persist permission grant:', error);
      }
    }
    return store.version(pluginId) === version;
  }
}

export function isPluginPermission(value: unknown): value is PluginPermission {
  return permissionSchema.safeParse(value).success;
}
