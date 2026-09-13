import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type {
  PluginSafeModeReason,
  PluginSafeModeState,
} from '../../shared/plugins/management';

const STARTUP_STATE_SCHEMA = 1;
const STARTUP_STATE_NAME = 'startup-state.json';

interface StoredStartupState {
  reason?: PluginSafeModeReason;
  schema: typeof STARTUP_STATE_SCHEMA;
  status: 'ready' | 'safe-mode' | 'starting';
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseStoredState(value: unknown): StoredStartupState | undefined {
  if (
    !isRecord(value) ||
    value.schema !== STARTUP_STATE_SCHEMA ||
    !['ready', 'safe-mode', 'starting'].includes(String(value.status)) ||
    typeof value.updatedAt !== 'string'
  ) {
    return;
  }
  const reason = value.reason;
  if (
    reason !== undefined &&
    ![
      'explicit',
      'previous-startup-incomplete',
      'startup-state-damaged',
    ].includes(String(reason))
  ) {
    return;
  }
  return {
    schema: STARTUP_STATE_SCHEMA,
    status: value.status as StoredStartupState['status'],
    updatedAt: value.updatedAt,
    ...(reason ? { reason: reason as PluginSafeModeReason } : {}),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export class PluginStartupGuard {
  private readonly path: string;
  private state: PluginSafeModeState;
  private tail: Promise<unknown> = Promise.resolve();

  private constructor(path: string, state: PluginSafeModeState) {
    this.path = path;
    this.state = state;
  }

  static async start(options: {
    appDataRoot: string;
    argv?: readonly string[];
    env?: Readonly<Record<string, string | undefined>>;
  }): Promise<PluginStartupGuard> {
    const path = join(options.appDataRoot, 'plugins', STARTUP_STATE_NAME);
    const explicit =
      options.argv?.includes('--safe-mode') === true ||
      options.env?.GHOSTBOARD_SAFE_MODE === '1';
    let stored: StoredStartupState | undefined;
    let damaged = false;
    let canWriteState = true;
    if (existsSync(path)) {
      try {
        stored = parseStoredState(JSON.parse(await readFile(path, 'utf8')));
        damaged = !stored;
      } catch {
        damaged = true;
      }
    } else {
      const preserved = await readdir(dirname(path)).catch(() => []);
      damaged = preserved.some((name) =>
        name.startsWith(`${STARTUP_STATE_NAME}.corrupt-`)
      );
    }
    if (damaged && existsSync(path)) {
      const backup = `${path}.corrupt-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      try {
        await rename(path, backup);
      } catch {
        // Keep the damaged file in place and stay in safe mode. Never replace
        // state we could not preserve first.
        canWriteState = false;
      }
    }
    const reason: PluginSafeModeReason | undefined = explicit
      ? 'explicit'
      : damaged
        ? 'startup-state-damaged'
        : stored?.status === 'starting'
          ? 'previous-startup-incomplete'
          : stored?.status === 'safe-mode'
            ? (stored.reason ?? 'previous-startup-incomplete')
            : undefined;
    if (reason) {
      const guard = new PluginStartupGuard(path, {
        active: true,
        nextStart: 'safe-mode',
        reason,
      });
      if (canWriteState) {
        await guard
          .write({
            schema: STARTUP_STATE_SCHEMA,
            status: 'safe-mode',
            reason,
            updatedAt: nowIso(),
          })
          .catch(() => undefined);
      }
      return guard;
    }
    const guard = new PluginStartupGuard(path, {
      active: false,
      nextStart: 'normal',
    });
    try {
      await guard.write({
        schema: STARTUP_STATE_SCHEMA,
        status: 'starting',
        updatedAt: nowIso(),
      });
    } catch {
      guard.state = {
        active: true,
        nextStart: 'safe-mode',
        reason: 'startup-state-damaged',
      };
    }
    return guard;
  }

  getState(): PluginSafeModeState {
    return { ...this.state };
  }

  markReady(): Promise<PluginSafeModeState> {
    return this.enqueue(async () => {
      if (this.state.active) {
        return this.getState();
      }
      await this.write({
        schema: STARTUP_STATE_SCHEMA,
        status: 'ready',
        updatedAt: nowIso(),
      });
      return this.getState();
    });
  }

  prepareNormalStart(): Promise<PluginSafeModeState> {
    return this.enqueue(async () => {
      if (!this.state.active) {
        return this.getState();
      }
      await this.write({
        schema: STARTUP_STATE_SCHEMA,
        status: 'ready',
        updatedAt: nowIso(),
      });
      this.state = { ...this.state, nextStart: 'normal' };
      return this.getState();
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async write(value: StoredStartupState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${crypto.randomUUID().slice(0, 8)}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, this.path);
  }
}
