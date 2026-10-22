import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pluginWorkspaceId } from './contentEvents';
import { NoteContentService } from './noteContent';
import {
  type PluginPermissionDecision,
  PluginPermissionDeniedError,
  PluginPermissionGate,
  type PluginPermissionPrompter,
  PluginPermissionStore,
} from './permissions';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'gb-plugin-permissions-'));
});

afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

function gateWith(
  decisions: PluginPermissionDecision[],
  options: { known?: string[]; prompt?: boolean } = {}
) {
  const queue = [...decisions];
  const prompt = vi.fn<PluginPermissionPrompter>(
    async () => queue.shift() ?? 'deny'
  );
  const store = new PluginPermissionStore(directory);
  const known = new Set(options.known ?? ['com.example.plugin']);
  const gate = new PluginPermissionGate({
    store,
    describePlugin: async (pluginId) =>
      known.has(pluginId) ? `Plugin ${pluginId}` : undefined,
    prompt: options.prompt === false ? undefined : prompt,
  });
  return { gate, prompt, store };
}

const PLUGIN = 'com.example.plugin';

describe('PluginPermissionGate', () => {
  it('allows once without persisting, so the next request asks again', async () => {
    const { gate, prompt, store } = gateWith(['allow-once', 'allow-once']);
    expect(await gate.check(PLUGIN, 'files.read')).toBe(true);
    expect(await gate.check(PLUGIN, 'files.read')).toBe(true);
    expect(prompt).toHaveBeenCalledTimes(2);
    expect(await store.list()).toEqual([]);
  });

  it('persists "always allow" (0600) and stops asking, across instances', async () => {
    const first = gateWith(['always-allow']);
    expect(await first.gate.check(PLUGIN, 'files.read')).toBe(true);
    expect(await first.gate.check(PLUGIN, 'files.read')).toBe(true);
    expect(first.prompt).toHaveBeenCalledOnce();

    const file = join(directory, 'plugin-permissions.json');
    expect(((await stat(file)).mode % 0o1000).toString(8)).toBe('600');
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
      schema: 'ghostboard-plugin-permissions/v1',
      grants: [{ permission: 'files.read', pluginId: PLUGIN }],
    });

    const second = gateWith([]);
    expect(await second.gate.check(PLUGIN, 'files.read')).toBe(true);
    expect(second.prompt).not.toHaveBeenCalled();
  });

  it('scopes grants per plugin and per permission', async () => {
    const { gate, prompt } = gateWith(['always-allow', 'deny', 'deny'], {
      known: [PLUGIN, 'com.example.other'],
    });
    expect(await gate.check(PLUGIN, 'files.read')).toBe(true);
    expect(await gate.check(PLUGIN, 'files.directory')).toBe(false);
    expect(await gate.check('com.example.other', 'files.read')).toBe(false);
    expect(prompt).toHaveBeenCalledTimes(3);
  });

  it('remembers "deny" for the session without persisting it', async () => {
    const { gate, prompt, store } = gateWith(['deny']);
    expect(await gate.check(PLUGIN, 'content.delete')).toBe(false);
    expect(await gate.check(PLUGIN, 'content.delete')).toBe(false);
    expect(prompt).toHaveBeenCalledOnce();
    expect(await store.list()).toEqual([]);
    await expect(gate.require(PLUGIN, 'content.delete')).rejects.toBeInstanceOf(
      PluginPermissionDeniedError
    );
  });

  it('denies unknown plugins without showing a dialog', async () => {
    const { gate, prompt } = gateWith(['always-allow']);
    expect(await gate.check('com.unknown.plugin', 'files.read')).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('denies by default when no native prompt is available', async () => {
    const { gate } = gateWith([], { prompt: false });
    expect(await gate.check(PLUGIN, 'files.read')).toBe(false);
  });

  it('denies when the prompt throws', async () => {
    const store = new PluginPermissionStore(directory);
    const gate = new PluginPermissionGate({
      store,
      describePlugin: async () => 'Plugin',
      prompt: () => Promise.reject(new Error('no display')),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await gate.check(PLUGIN, 'files.read')).toBe(false);
    warn.mockRestore();
  });

  it('shares one dialog between concurrent identical requests', async () => {
    let resolve: (value: PluginPermissionDecision) => void = () => undefined;
    const prompt = vi.fn<PluginPermissionPrompter>(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const gate = new PluginPermissionGate({
      store: new PluginPermissionStore(directory),
      describePlugin: async () => 'Plugin',
      prompt,
    });
    const results = Promise.all([
      gate.check(PLUGIN, 'files.read'),
      gate.check(PLUGIN, 'files.read'),
    ]);
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    resolve('allow-once');
    expect(await results).toEqual([true, true]);
  });

  it('revokes one permission or all of a plugin', async () => {
    const { gate, store } = gateWith([
      'always-allow',
      'always-allow',
      'always-allow',
    ]);
    await gate.check(PLUGIN, 'files.read');
    await gate.check(PLUGIN, 'files.directory');
    await gate.check(PLUGIN, 'content.delete');
    await gate.revoke(PLUGIN, 'files.read');
    expect((await store.list()).map((grant) => grant.permission)).toEqual([
      'files.directory',
      'content.delete',
    ]);
    await gate.revoke(PLUGIN);
    expect(await store.list()).toEqual([]);
  });

  it('treats a damaged grants file as no grants (asks again)', async () => {
    await writeFile(join(directory, 'plugin-permissions.json'), '{nope');
    const { gate, prompt } = gateWith(['deny']);
    expect(await gate.check(PLUGIN, 'files.read')).toBe(false);
    expect(prompt).toHaveBeenCalledOnce();
  });
});

describe('NoteContentService bulk delete consent', () => {
  async function setup(check: (pluginId: string) => Promise<boolean>) {
    // Same layout `initWorkspace` creates (not imported: it pulls in Electrobun).
    const workspace = join(directory, 'ws');
    for (const dir of ['.ghostboard/views', '.ghostboard/trash', 'content']) {
      await mkdir(join(workspace, dir), { recursive: true });
    }
    const workspaceId = pluginWorkspaceId(workspace);
    const permissions = { check: vi.fn(check) };
    const service = new NoteContentService(workspace, workspaceId, {
      permissions,
    });
    const call = (body: Record<string, unknown>, pluginScoped: boolean) =>
      service.handle(
        new Request('http://127.0.0.1/plugins/content', {
          method: 'POST',
          body: JSON.stringify({ workspaceId, pluginId: PLUGIN, ...body }),
        }),
        {},
        pluginScoped ? { pluginId: PLUGIN } : {}
      );
    const created = await call(
      {
        action: 'create',
        operationId: 'create-1',
        label: 'Import',
        notes: [{ title: 'One' }, { title: 'Two' }],
      },
      true
    );
    if (created?.status !== 200) {
      throw new Error(`create failed: ${await created?.text()}`);
    }
    return { call, permissions };
  }

  it('asks in the main process when a plugin token undoes a multi-note creation', async () => {
    const { call, permissions } = await setup(async () => false);
    const denied = await call(
      { action: 'undo', operationId: 'undo-1', batchId: 'create-1' },
      true
    );
    expect(denied?.status).toBe(403);
    expect(await denied?.json()).toMatchObject({ code: 'permission-denied' });
    expect(permissions.check).toHaveBeenCalledWith(
      PLUGIN,
      'content.delete',
      expect.stringContaining('2 notes')
    );
  });

  it('proceeds when allowed', async () => {
    const { call } = await setup(async () => true);
    const allowed = await call(
      { action: 'undo', operationId: 'undo-1', batchId: 'create-1' },
      true
    );
    expect(allowed?.status).toBe(200);
  });

  it('does not ask for host (renderer-token) undo', async () => {
    const { call, permissions } = await setup(async () => false);
    const response = await call(
      { action: 'undo', operationId: 'undo-1', batchId: 'create-1' },
      false
    );
    expect(response?.status).toBe(200);
    expect(permissions.check).not.toHaveBeenCalled();
  });
});
