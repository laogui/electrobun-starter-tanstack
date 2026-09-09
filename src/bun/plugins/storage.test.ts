import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginStorageHost } from './storage';

let directory: string;
let host: PluginStorageHost;
const input = {
  pluginId: 'example.test',
  workspaceId: 'a',
  scope: 'workspace',
};
function makeHost(workspace = 'a') {
  return new PluginStorageHost({
    appDataRoot: join(directory, 'app'),
    workspacePath: join(directory, workspace),
    workspaceId: workspace,
  });
}
async function call(body: Record<string, unknown>, target = host) {
  const response = await target.handle(
    new Request('http://localhost/plugins/storage', {
      method: 'POST',
      body: JSON.stringify({ ...input, ...body }),
    }),
    {}
  );
  return {
    status: response!.status,
    result: (await response!.json()) as Record<string, any>,
  };
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'gb-plugin-storage-'));
  vi.stubGlobal('Bun', { write: writeFile });
  host = makeHost();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(directory, { force: true, recursive: true });
});

describe('plugin persistent KV', () => {
  it('retains JSON, null and traversal-like dictionary keys across service restart', async () => {
    for (const [key, value] of [
      ['../outside', { count: 7 }],
      ['__proto__', null],
      ['prefix/z', true],
      ['prefix/a', [1, 'two']],
    ]) {
      expect((await call({ operation: 'set', key, value })).status).toBe(200);
    }
    host = makeHost();
    expect(
      (await call({ operation: 'get', key: '../outside' })).result
    ).toEqual({ found: true, value: { count: 7 } });
    expect((await call({ operation: 'get', key: '__proto__' })).result).toEqual(
      { found: true, value: null }
    );
    expect((await call({ operation: 'get', key: 'missing' })).result).toEqual({
      found: false,
    });
    expect(
      (await call({ operation: 'list', prefix: 'prefix/' })).result
    ).toEqual({ keys: ['prefix/a', 'prefix/z'] });
    await call({ operation: 'delete', key: '../outside' });
    await call({ operation: 'delete', key: '../outside' });
    expect(
      (await call({ operation: 'get', key: '../outside' })).result
    ).toEqual({ found: false });
  });

  it('separates plugins and workspaces but shares the app scope across workspaces', async () => {
    await call({ operation: 'set', key: 'key', value: 'workspace-a' });
    await call({
      operation: 'set',
      scope: 'app',
      key: 'key',
      value: 'application',
    });
    const second = makeHost('b');
    expect(
      (await call({ operation: 'get', workspaceId: 'b', key: 'key' }, second))
        .result.found
    ).toBe(false);
    expect(
      (
        await call(
          { operation: 'get', workspaceId: 'b', scope: 'app', key: 'key' },
          second
        )
      ).result.value
    ).toBe('application');
    expect(
      (
        await call({
          operation: 'get',
          pluginId: 'example.other',
          scope: 'app',
          key: 'key',
        })
      ).result.found
    ).toBe(false);
    expect(
      (
        await call({
          operation: 'set',
          workspaceId: 'b',
          key: 'key',
          value: 'wrong',
        })
      ).status
    ).toBe(409);
    expect((await call({ operation: 'get', key: 'key' })).result.value).toBe(
      'workspace-a'
    );
  });

  it('serializes concurrent read-modify-write across service instances', async () => {
    const second = makeHost('b');
    const writes = await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        call(
          {
            operation: 'set',
            scope: 'app',
            workspaceId: index % 2 ? 'a' : 'b',
            key: `key-${index}`,
            value: index,
          },
          index % 2 ? host : second
        )
      )
    );
    expect(writes.every((result) => result.status === 200)).toBe(true);
    expect(
      (await call({ operation: 'list', scope: 'app' })).result.keys
    ).toHaveLength(25);
  });

  it.each([
    { pluginId: '../example.test' },
    { pluginId: 'example/test' },
    { scope: 'arbitrary' },
    { operation: 'execute' },
    { key: '' },
    { value: undefined },
    { value: 'x'.repeat(1_048_576) },
  ])('rejects malformed input without writing (case %#)', async (patch) => {
    expect(
      (await call({ operation: 'set', key: 'key', value: true, ...patch }))
        .status
    ).toBe(400);
    expect((await call({ operation: 'list' })).result.keys).toEqual([]);
  });

  it('preserves corrupt storage and can recover after the file is repaired', async () => {
    await call({ operation: 'set', key: 'key', value: 'before' });
    const path = join(
      directory,
      'a/.ghostboard/plugin-data/example.test/kv.json'
    );
    const original = await readFile(path, 'utf8');
    await writeFile(path, '{broken');
    expect(
      (await call({ operation: 'set', key: 'key', value: 'after' })).status
    ).toBe(500);
    expect(await readFile(path, 'utf8')).toBe('{broken');
    await writeFile(path, original);
    expect((await call({ operation: 'get', key: 'key' })).result.value).toBe(
      'before'
    );
  });

  it('rejects a linked storage file without overwriting the target', async () => {
    await call({ operation: 'set', key: 'key', value: true });
    const path = join(
      directory,
      'a/.ghostboard/plugin-data/example.test/kv.json'
    );
    const target = join(directory, 'untouched.json');
    await writeFile(target, 'untouched');
    await rm(path);
    await symlink(target, path);
    expect(
      (await call({ operation: 'set', key: 'key', value: false })).status
    ).toBe(500);
    expect(await readFile(target, 'utf8')).toBe('untouched');
  });

  it('leaves the previous file intact when an atomic write fails', async () => {
    await call({ operation: 'set', key: 'key', value: 'before' });
    vi.stubGlobal('Bun', {
      write: vi.fn().mockRejectedValue(new Error('disk full')),
    });
    expect(
      (await call({ operation: 'set', key: 'key', value: 'after' })).status
    ).toBe(500);
    expect((await call({ operation: 'get', key: 'key' })).result.value).toBe(
      'before'
    );
  });

  it('ignores unrelated routes and rejects other methods', async () => {
    expect(
      await host.handle(new Request('http://localhost/unrelated'), {})
    ).toBeNull();
    expect(
      (await host.handle(new Request('http://localhost/plugins/storage'), {}))
        ?.status
    ).toBe(405);
  });
});
