import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PluginRuntimeSnapshot } from '../../shared/plugins/runtime';
import { createStoredZip, pluginFiles } from '../../test/pluginPackage';
import { servePluginAsset } from '../pluginAssets';
import { PluginHostController } from './hostController';
import { PluginManagementService } from './management';

vi.mock('../appPaths', () => ({
  getAppDataRoot: () => {
    throw new Error('Specify app root');
  },
}));
let root: string;
const hosts: PluginHostController[] = [];
const token = 'launch-token';
const ENTRY_URL = /^http:\/\/127\.0\.0\.1:54321\/plugins\/launch-token\//;
const MANIFEST_ERROR = /JSON|manifest/i;
const LEGACY_ERROR = /旧|legacy|v1|version.*1/i;
const ENTRY_ERROR = /entry/i;
const cors = { 'Access-Control-Allow-Origin': '*' };
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'plugin-host-test-'));
  vi.stubGlobal('Bun', {
    file: (path: string) => new Blob([Uint8Array.from(readFileSync(path))]),
  });
});
afterEach(async () => {
  for (const host of hosts.splice(0)) {
    host.dispose();
  }
  vi.unstubAllGlobals();
  await rm(root, { recursive: true, force: true });
});
function service(workspace = 'workspace') {
  return new PluginManagementService(join(root, workspace), {
    appDataRoot: join(root, 'app'),
  });
}
function hostFor(manager: PluginManagementService, workspace = 'workspace') {
  const host = new PluginHostController(manager, workspace);
  hosts.push(host);
  return host;
}
async function snapshot(
  host: PluginHostController
): Promise<PluginRuntimeSnapshot> {
  const response = await host.handle(
    new Request('http://127.0.0.1:54321/plugins/runtime'),
    token,
    cors
  );
  if (response?.status !== 200) {
    throw new Error(`Runtime request failed: ${response?.status}`);
  }
  return (await response.json()) as PluginRuntimeSnapshot;
}
function firstPlugin(snapshot: PluginRuntimeSnapshot) {
  const entry = snapshot.plugins[0];
  if (!entry) {
    throw new Error('Expected an active plugin');
  }
  return entry;
}
async function directory() {
  const path = join(root, 'development');
  await mkdir(path);
  for (const [name, content] of Object.entries(pluginFiles())) {
    await writeFile(join(path, name), content);
  }
  await writeFile(
    join(path, 'main.js'),
    "import './relative.js'; throw new Error('must never execute on host');"
  );
  await writeFile(join(path, 'relative.js'), 'export const value = 1;');
  return path;
}
async function connected() {
  const path = await directory();
  const manager = service();
  const preview = await manager.prepareDevelopmentDirectory(path);
  const installed = await manager.commit(preview.transactionId);
  return { path, manager, installed, host: hostFor(manager) };
}
async function asset(host: PluginHostController, url: string) {
  return await servePluginAsset(
    new Request(url),
    token,
    host.getMounts(),
    cors
  );
}

async function post(host: PluginHostController, route: string, body: unknown) {
  return await host.handle(
    new Request(`http://127.0.0.1:54321/plugins/${route}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    token,
    cors
  );
}

async function release(
  host: PluginHostController,
  plugin: { pluginId: string; generation: string }
) {
  return await post(host, 'release', {
    pluginId: plugin.pluginId,
    generation: plugin.generation,
  });
}

describe('trusted plugin host', () => {
  it('connects without execution, enables per workspace, reloads the entire relative graph and disables', async () => {
    const { manager, installed, path, host } = await connected();
    expect(installed).toMatchObject({
      development: true,
      source: { kind: 'directory' },
      enabled: false,
    });
    expect((await snapshot(host)).plugins).toEqual([]);
    await manager.enable(installed);
    const first = await snapshot(host);
    expect(first.workspaceId).toBe('workspace');
    const entry = firstPlugin(first);
    expect(entry?.entryUrl).toMatch(ENTRY_URL);
    expect((await asset(host, entry.entryUrl))?.status).toBe(200);
    const relativeUrl = new URL('./relative.js', entry.entryUrl).href;
    expect(await (await asset(host, relativeUrl))?.text()).toContain(
      'value = 1'
    );
    expect(firstPlugin(await snapshot(host)).generation).toBe(entry.generation);
    await writeFile(join(path, 'relative.js'), 'export const value = 2;');
    // Until polling switches generations, the old graph stays internally consistent.
    expect(await (await asset(host, relativeUrl))?.text()).toContain(
      'value = 1'
    );
    const second = firstPlugin(await snapshot(host));
    expect(second.generation).not.toBe(entry.generation);
    expect(
      await (
        await asset(host, new URL('./relative.js', second.entryUrl).href)
      )?.text()
    ).toContain('value = 2');
    expect((await asset(host, entry.entryUrl))?.status).toBe(200);
    expect(await (await asset(host, relativeUrl))?.text()).toContain(
      'value = 1'
    );
    expect(host.getMounts()).toHaveLength(2);
    expect((await manager.list())[0]).toMatchObject({
      digest: installed.digest,
      enabled: true,
    });
    expect(await snapshot(hostFor(service('other'), 'other'))).toMatchObject({
      workspaceId: 'other',
      plugins: [],
    });
    expect((await snapshot(hostFor(service()))).plugins).toHaveLength(1);
    await manager.disable(installed);
    expect((await snapshot(host)).plugins).toEqual([]);
    expect(host.getMounts()).toEqual([]);
    expect((await asset(host, second.entryUrl))?.status).toBe(404);
  });

  it('publishes no third-party code in safe mode while keeping startup recovery reachable', async () => {
    const { manager, installed } = await connected();
    await manager.enable(installed);
    const markStartupReady = vi.fn(async () => undefined);
    const list = vi.spyOn(manager, 'list');
    const host = new PluginHostController(manager, 'workspace', {
      safeMode: {
        active: true,
        nextStart: 'safe-mode',
        reason: 'previous-startup-incomplete',
      },
      markStartupReady,
    });
    hosts.push(host);

    expect(await snapshot(host)).toEqual({
      workspaceId: 'workspace',
      plugins: [],
      diagnostics: [],
    });
    expect(list).not.toHaveBeenCalled();
    expect(host.getMounts()).toEqual([]);
    const ready = await post(host, 'startup-ready', {});
    expect(ready?.status).toBe(200);
    expect(await ready?.json()).toEqual({ success: true });
    expect(markStartupReady).toHaveBeenCalledOnce();
  });

  it('keeps the previous descriptor and graph on invalid manifest, identity change, v1 and missing entry, then recovers', async () => {
    const { manager, installed, path, host } = await connected();
    await manager.enable(installed);
    const original = await readFile(join(path, 'manifest.json'), 'utf8');
    for (const [text, error] of [
      ['{', MANIFEST_ERROR],
      [
        JSON.stringify({
          ...(JSON.parse(original) as Record<string, unknown>),
          id: 'example.changed',
        }),
        'identity changed',
      ],
      [
        JSON.stringify({
          ...(JSON.parse(original) as Record<string, unknown>),
          manifestVersion: 1,
        }),
        LEGACY_ERROR,
      ],
      [
        JSON.stringify({
          ...(JSON.parse(original) as Record<string, unknown>),
          entrypoints: { app: 'missing.js' },
        }),
        ENTRY_ERROR,
      ],
    ] as const) {
      const old = firstPlugin(await snapshot(host));
      await writeFile(join(path, 'manifest.json'), text);
      const invalid = await snapshot(host);
      expect(invalid.plugins).toEqual([old]);
      expect(invalid.diagnostics[0]).toMatchObject({
        pluginId: installed.pluginId,
        message: expect.stringMatching(error),
      });
      expect(host.getMounts()).toHaveLength(1);
      expect((await asset(host, old.entryUrl))?.status).toBe(200);
      await expect(manager.enable(installed)).rejects.toThrow();
      await writeFile(join(path, 'manifest.json'), original);
      expect((await snapshot(host)).plugins).toHaveLength(1);
    }
  });

  it('releases any older generation independently and keeps lazy imports immutable until release', async () => {
    const { manager, installed, path, host } = await connected();
    await manager.enable(installed);
    const first = firstPlugin(await snapshot(host));
    await writeFile(join(path, 'relative.js'), 'export const value = 2;');
    const second = firstPlugin(await snapshot(host));
    await writeFile(join(path, 'relative.js'), 'export const value = 3;');
    const third = firstPlugin(await snapshot(host));
    const firstMount = host
      .getMounts()
      .find((mount) => mount.generation === first.generation);
    const secondMount = host
      .getMounts()
      .find((mount) => mount.generation === second.generation);
    expect(host.getMounts()).toHaveLength(3);
    for (const [index, entry] of [first, second, third].entries()) {
      expect(
        await (
          await asset(host, new URL('./relative.js', entry.entryUrl).href)
        )?.text()
      ).toContain(`value = ${index + 1}`);
    }
    expect((await release(host, second))?.status).toBe(200);
    expect((await asset(host, second.entryUrl))?.status).toBe(404);
    await expect(
      readFile(join(secondMount?.directory ?? '', 'relative.js'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await asset(host, first.entryUrl))?.status).toBe(200);
    expect((await asset(host, third.entryUrl))?.status).toBe(200);
    expect((await release(host, first))?.status).toBe(200);
    await expect(
      readFile(join(firstMount?.directory ?? '', 'relative.js'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(firstPlugin(await snapshot(host))).toEqual(third);
    expect(host.getMounts()).toHaveLength(1);
    expect((await release(host, second))?.status).toBe(200);
    expect(host.getMounts()).toHaveLength(1);
  });

  it('keeps a released failed candidate as a tombstone until source changes or manual reload', async () => {
    const { manager, installed, path, host } = await connected();
    await manager.enable(installed);
    const active = firstPlugin(await snapshot(host));
    await writeFile(
      join(path, 'main.js'),
      "throw new Error('failed candidate');"
    );
    const failed = firstPlugin(await snapshot(host));
    expect((await release(host, failed))?.status).toBe(200);
    for (let poll = 0; poll < 3; poll += 1) {
      expect(firstPlugin(await snapshot(host))).toEqual(failed);
      expect(host.getMounts()).toHaveLength(1);
      expect((await asset(host, failed.entryUrl))?.status).toBe(404);
      expect((await asset(host, active.entryUrl))?.status).toBe(200);
    }
    const manifest = await readFile(join(path, 'manifest.json'), 'utf8');
    await writeFile(join(path, 'manifest.json'), '{');
    expect((await snapshot(host)).plugins).toEqual([failed]);
    await writeFile(join(path, 'manifest.json'), manifest);
    expect(firstPlugin(await snapshot(host))).toEqual(failed);
    expect(
      (await post(host, 'reload', { pluginId: installed.pluginId }))?.status
    ).toBe(200);
    const retry = firstPlugin(await snapshot(host));
    expect(retry.generation).not.toBe(failed.generation);
    expect((await asset(host, active.entryUrl))?.status).toBe(200);
    await release(host, retry);
    await writeFile(join(path, 'relative.js'), 'export const value = 4;');
    const changed = firstPlugin(await snapshot(host));
    expect(changed.generation).not.toBe(retry.generation);
    expect(host.getMounts()).toHaveLength(2);
    await manager.disable(installed);
    expect((await snapshot(host)).plugins).toEqual([]);
    expect(host.getMounts()).toEqual([]);
    await manager.enable(installed);
    expect(firstPlugin(await snapshot(host)).generation).not.toBe(
      changed.generation
    );
  });

  it('validates release requests and makes unknown, mismatched and repeated releases harmless', async () => {
    const { manager, installed, host } = await connected();
    await manager.enable(installed);
    const first = firstPlugin(await snapshot(host));
    for (const body of [
      null,
      [],
      {},
      { pluginId: first.pluginId },
      { generation: first.generation },
      { pluginId: 1, generation: first.generation },
      { pluginId: first.pluginId, generation: 1 },
      { pluginId: '', generation: first.generation },
      { pluginId: first.pluginId, generation: ' ' },
    ]) {
      expect((await post(host, 'release', body))?.status).toBe(400);
    }
    expect(
      (
        await host.handle(
          new Request('http://127.0.0.1:54321/plugins/release', {
            method: 'POST',
            body: '{',
          }),
          token,
          cors
        )
      )?.status
    ).toBe(400);
    expect(
      (
        await host.handle(
          new Request('http://127.0.0.1:54321/plugins/release'),
          token,
          cors
        )
      )?.status
    ).toBe(405);
    expect(
      (await release(host, { ...first, pluginId: 'example.other' }))?.status
    ).toBe(200);
    expect(
      (await release(host, { ...first, generation: 'unknown' }))?.status
    ).toBe(200);
    expect((await asset(host, first.entryUrl))?.status).toBe(200);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await release(host, first);
      expect(response?.status).toBe(200);
      expect(await response?.json()).toEqual({ success: true });
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(response?.headers.get('Access-Control-Allow-Origin')).toBe('*');
    }
    expect(host.getMounts()).toEqual([]);
    expect(firstPlugin(await snapshot(host))).toEqual(first);
    host.dispose();
    expect((await release(host, first))?.status).toBe(410);
  });

  it('retains descriptor metadata and every graph through read failures and failed routes', async () => {
    const { manager, installed, path, host } = await connected();
    await manager.enable(installed);
    const first = firstPlugin(await snapshot(host));
    await writeFile(join(path, 'relative.js'), 'export const value = 2;');
    const second = firstPlugin(await snapshot(host));
    const resolve = vi
      .spyOn(manager, 'resolveRuntimePackage')
      .mockRejectedValueOnce(new Error('Transient read failure'));
    const failed = await snapshot(host);
    expect(failed.plugins).toEqual([second]);
    expect(failed.diagnostics).toContainEqual({
      pluginId: installed.pluginId,
      message: 'Transient read failure',
    });
    resolve.mockRestore();
    const list = vi
      .spyOn(manager, 'list')
      .mockRejectedValueOnce(new Error('Transient listing failure'));
    expect(
      (
        await host.handle(
          new Request('http://127.0.0.1:54321/plugins/runtime'),
          token,
          cors
        )
      )?.status
    ).toBe(500);
    list.mockRejectedValueOnce(new Error('Transient reload failure'));
    expect(
      (await post(host, 'reload', { pluginId: installed.pluginId }))?.status
    ).toBe(500);
    list.mockRestore();
    expect(host.getMounts()).toHaveLength(2);
    expect((await asset(host, first.entryUrl))?.status).toBe(200);
    expect((await asset(host, second.entryUrl))?.status).toBe(200);
    expect(firstPlugin(await snapshot(host))).toEqual(second);
    const summary = (await manager.list())[0];
    if (!summary) {
      throw new Error('Expected installed summary');
    }
    const invalid = vi.spyOn(manager, 'list').mockResolvedValue([
      {
        ...summary,
        status: 'invalid',
        name: 'Invalid new name',
        version: '99.0.0',
        development: false,
        validationError: 'Invalid edit',
      },
    ]);
    expect((await snapshot(host)).plugins).toEqual([second]);
    invalid.mockRestore();
    await writeFile(join(path, 'manifest.json'), '{');
    await manager.disable(installed);
    expect((await snapshot(host)).plugins).toEqual([]);
    expect(host.getMounts()).toEqual([]);
  });

  it('retains a pending manual reload across invalid edits and revokes all generations on removal', async () => {
    const { manager, installed, path, host } = await connected();
    await manager.enable(installed);
    const first = firstPlugin(await snapshot(host));
    const manifest = await readFile(join(path, 'manifest.json'), 'utf8');
    await writeFile(join(path, 'manifest.json'), '{');
    expect(
      (await post(host, 'reload', { pluginId: installed.pluginId }))?.status
    ).toBe(200);
    expect(firstPlugin(await snapshot(host))).toEqual(first);
    expect((await asset(host, first.entryUrl))?.status).toBe(200);
    await writeFile(join(path, 'manifest.json'), manifest);
    const second = firstPlugin(await snapshot(host));
    expect(second.generation).not.toBe(first.generation);
    expect(firstPlugin(await snapshot(host))).toEqual(second);
    const list = vi.spyOn(manager, 'list').mockResolvedValue([]);
    expect((await snapshot(host)).plugins).toEqual([]);
    expect(host.getMounts()).toEqual([]);
    expect((await asset(host, first.entryUrl))?.status).toBe(404);
    expect((await asset(host, second.entryUrl))?.status).toBe(404);
    expect((await release(host, first))?.status).toBe(200);
    list.mockRestore();
  });

  it('serializes release behind an in-flight refresh', async () => {
    const { manager, installed, path, host } = await connected();
    await manager.enable(installed);
    const first = firstPlugin(await snapshot(host));
    await writeFile(join(path, 'relative.js'), 'export const value = 2;');
    const summaries = await manager.list();
    let resume: (value: typeof summaries) => void = () => undefined;
    const pending = new Promise<typeof summaries>((resolve) => {
      resume = resolve;
    });
    const list = vi.spyOn(manager, 'list').mockReturnValueOnce(pending);
    const next = snapshot(host);
    const released = release(host, first);
    expect((await asset(host, first.entryUrl))?.status).toBe(200);
    resume(summaries);
    const second = firstPlugin(await next);
    expect((await released)?.status).toBe(200);
    expect(second.generation).not.toBe(first.generation);
    expect((await asset(host, first.entryUrl))?.status).toBe(404);
    expect((await asset(host, second.entryUrl))?.status).toBe(200);
    list.mockRestore();
  });

  it('serves installed v2 ZIPs and forces generation replacement through reload', async () => {
    const manager = service();
    const zip = join(root, 'plugin.zip');
    await writeFile(zip, createStoredZip(pluginFiles()));
    const preview = await manager.prepareFromFile(zip);
    const installed = await manager.commit(preview.transactionId);
    await manager.enable(installed);
    const host = hostFor(manager);
    const first = firstPlugin(await snapshot(host));
    expect(first.development).toBe(false);
    expect(await (await asset(host, first.entryUrl))?.text()).toContain(
      'must not execute'
    );
    const reload = await host.handle(
      new Request('http://127.0.0.1:54321/plugins/reload', {
        method: 'POST',
        body: JSON.stringify({ pluginId: installed.pluginId }),
      }),
      token,
      cors
    );
    expect(reload?.status).toBe(200);
    expect(host.getMounts()).toHaveLength(1);
    expect(firstPlugin(await snapshot(host)).generation).not.toBe(
      first.generation
    );
    expect(host.getMounts()).toHaveLength(2);
    expect((await asset(host, first.entryUrl))?.status).toBe(200);
    host.dispose();
    expect(host.getMounts()).toEqual([]);
    expect(
      (
        await host.handle(
          new Request('http://127.0.0.1/plugins/runtime'),
          token,
          cors
        )
      )?.status
    ).toBe(410);
  });
});

const INTEGRITY_ERROR = /no longer match/;

describe('installed package integrity at runtime', () => {
  async function installed() {
    const manager = service();
    const file = join(root, 'example.zip');
    await writeFile(file, createStoredZip(pluginFiles()));
    const preview = await manager.prepareFromFile(file);
    const entry = await manager.commit(preview.transactionId);
    await manager.enable(entry);
    return { entry, host: hostFor(manager), manager };
  }

  it('refuses a new generation after the installed files change', async () => {
    const { entry, host } = await installed();
    const first = await snapshot(host);
    expect(firstPlugin(first).pluginId).toBe(entry.pluginId);

    const packageDir = join(
      root,
      'app',
      'plugins',
      'packages',
      entry.pluginId,
      entry.version,
      entry.digest
    );
    await writeFile(join(packageDir, 'main.js'), '// swapped after install\n');
    await post(host, 'reload', { pluginId: entry.pluginId });

    const second = await snapshot(host);
    expect(second.plugins).toEqual([]);
    expect(second.diagnostics[0]?.message).toMatch(INTEGRITY_ERROR);
  });

  it('still hot reloads a development directory', async () => {
    const {
      manager,
      installed: connectedPlugin,
      path,
      host,
    } = await connected();
    await manager.enable(connectedPlugin);
    const first = firstPlugin(await snapshot(host));

    await writeFile(join(path, 'relative.js'), 'export const value = 3;');
    await post(host, 'reload', { pluginId: connectedPlugin.pluginId });
    const second = firstPlugin(await snapshot(host));
    expect(second.generation).not.toBe(first.generation);
    expect(
      await (
        await asset(host, new URL('./relative.js', second.entryUrl).href)
      )?.text()
    ).toContain('value = 3');
  });
});
