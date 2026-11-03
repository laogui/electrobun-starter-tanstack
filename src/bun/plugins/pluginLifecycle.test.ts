import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  buildPluginPackage,
  generateSigningKey,
} from '../../../packages/plugin-sdk/package-plugin.js';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
}));
const { PluginManagementService } = await import('./management');
const { PluginInstallStore } = await import('./pluginInstall');
const { getPluginPermissionStore } = await import('./permissions');
const { readPluginContents } = await import('./directoryContents');
const atomic = await import('../atomicWrite');
const directoryContents = await import('./directoryContents');
const { PluginHostController } = await import('./hostController');
const { LocalHttpCredentials } = await import('../localHttpAuth');
const { PluginDirectoryCache } = await import('./pluginDirectoryCache');
let root: string;
let runtime: string;
let publicKey: string;
const pluginId = 'community.lifecycle';
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'plugin-lifecycle-'));
  runtime = join(root, 'runtime');
  await mkdir(runtime);
  publicKey = (await generateSigningKey(join(root, 'key.pem'))).publicKey;
});
afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});
const service = (workspace = 'workspace') =>
  new PluginManagementService(join(root, workspace), { appDataRoot: root });
async function packageVersion(version: string) {
  await writeFile(
    join(runtime, 'manifest.json'),
    JSON.stringify({
      manifestVersion: 2,
      id: pluginId,
      name: 'Lifecycle',
      version,
      entrypoints: { app: 'main.js' },
      engines: { ghostboard: '>=1.0.0 <2.0.0' },
      capabilities: [],
      publicKey,
      update: { url: 'https://example.com/releases.json' },
    })
  );
  await writeFile(
    join(runtime, 'main.js'),
    `export const version = '${version}';`
  );
  await mkdir(join(runtime, 'a'), { recursive: true });
  await writeFile(join(runtime, 'a.js'), 'export default 1');
  await writeFile(join(runtime, 'a/z.js'), 'export default 2');
  const output = join(root, `${version}.zip`);
  await buildPluginPackage({
    source: runtime,
    output,
    privateKey: join(root, 'key.pem'),
  });
  return output;
}
async function install(version: string) {
  const s = service();
  const preview = await s.prepareFromFile(await packageVersion(version));
  return s.commit(preview.transactionId);
}
it('uninstalls across workspaces, revokes cached grants, keeps content and permits the same ID again', async () => {
  const installed = await install('1.0.0');
  const a = service();
  const b = service('other');
  await a.enable(installed);
  await b.enable(installed);
  const permissions = getPluginPermissionStore(root);
  await permissions.grant(pluginId, 'files.read');
  await mkdir(join(root, 'workspace/content'), { recursive: true });
  const note = join(root, 'workspace/content/keep.md');
  await writeFile(note, 'user content');
  await a.remove(installed);
  expect((await a.list()).some((p) => p.pluginId === pluginId)).toBe(false);
  expect((await b.list()).some((p) => p.enabled)).toBe(false);
  expect(await permissions.has(pluginId, 'files.read')).toBe(false);
  expect(await readFile(note, 'utf8')).toBe('user content');
  expect(await readdir(join(root, 'plugins/removed'))).toHaveLength(1);
  const reinstalled = await install('1.0.0');
  expect(reinstalled.enabled).toBe(false);
  expect((await b.list()).find((p) => p.pluginId === pluginId)?.enabled).toBe(
    false
  );
});
it('recovers an interrupted removal after archiving code without resurrecting a pending update', async () => {
  const installed = await install('1.0.0');
  const s = service();
  await s.enable(installed);
  const pending = await s.prepareFromFile(await packageVersion('1.1.0'));
  const original = atomic.atomicWrite;
  let injected = false;
  vi.spyOn(atomic, 'atomicWrite').mockImplementation((path, data) => {
    if (!injected && path === join(root, 'plugins/registry.json')) {
      injected = true;
      return Promise.reject(new Error('Injected removal interruption'));
    }
    return original(path, data);
  });
  await expect(s.remove(installed)).rejects.toThrow('Injected');
  await s.recover();
  expect((await s.list()).some((p) => p.pluginId === pluginId)).toBe(false);
  await expect(s.commit(pending.transactionId)).rejects.toThrow();
  expect((await s.list()).some((p) => p.pluginId === pluginId)).toBe(false);
  const [archive] = await readdir(join(root, 'plugins/removed'));
  expect(
    JSON.parse(
      await readFile(
        join(root, 'plugins/removed', archive!, 'receipt.json'),
        'utf8'
      )
    )
  ).toMatchObject({ complete: true });
});
it('rejects removal based on an outdated code version', async () => {
  const first = await install('1.0.0');
  const second = await install('1.1.0');
  const s = service();
  await s.enable(second);
  await expect(s.remove(first)).rejects.toThrow('changed');
  expect((await s.list()).find((p) => p.pluginId === pluginId)?.enabled).toBe(
    true
  );
});
it('disconnects development directories without removing source files and releases their ID', async () => {
  await packageVersion('1.0.0');
  const s = service();
  const preview = await s.prepareDevelopmentDirectory(runtime);
  const connected = await s.commit(preview.transactionId);
  await s.enable(connected);
  await s.remove(connected);
  expect(await readFile(join(runtime, 'main.js'), 'utf8')).toContain('1.0.0');
  expect((await s.list()).some((p) => p.pluginId === pluginId)).toBe(false);
  await expect(s.prepareDevelopmentDirectory(runtime)).resolves.toHaveProperty(
    'transactionId'
  );
});
it('does not reactivate another workspace after update and rollback', async () => {
  const first = await install('1.0.0');
  const a = service();
  const b = service('other');
  await a.enable(first);
  await b.enable(first);
  const second = await install('1.1.0');
  expect((await a.list()).find((p) => p.pluginId === pluginId)?.enabled).toBe(
    false
  );
  expect((await b.list()).find((p) => p.pluginId === pluginId)?.enabled).toBe(
    false
  );
  await a.rollback(second);
  expect((await a.list()).find((p) => p.pluginId === pluginId)?.enabled).toBe(
    false
  );
  expect((await b.list()).find((p) => p.pluginId === pluginId)?.enabled).toBe(
    false
  );
});
it('restores workspace enablement when a code update or rollback fails without changing code', async () => {
  const first = await install('1.0.0');
  const a = service();
  const b = service('other');
  await a.enable(first);
  await b.enable(first);
  const next = await a.prepareFromFile(await packageVersion('1.1.0'));
  vi.spyOn(PluginInstallStore.prototype, 'commit').mockRejectedValueOnce(
    new Error('Injected install failure')
  );
  await expect(a.commit(next.transactionId)).rejects.toThrow('Injected');
  await expect(a.rollback(first)).rejects.toThrow();
  expect((await a.list()).find((p) => p.pluginId === pluginId)?.enabled).toBe(
    true
  );
  expect((await b.list()).find((p) => p.pluginId === pluginId)?.enabled).toBe(
    true
  );
});
it('migrates an intact pre-canonical runtime checksum without falsely quarantining the package', async () => {
  const installed = await install('1.0.0');
  const registryPath = join(root, 'plugins/registry.json');
  const registry = JSON.parse(await readFile(registryPath, 'utf8')) as {
    packages: Array<{ directory: string; treeDigest: string }>;
  };
  const contents = await readPluginContents(registry.packages[0]!.directory);
  expect(contents.legacyDigest).not.toBe(contents.digest);
  registry.packages[0]!.treeDigest = contents.legacyDigest;
  await writeFile(registryPath, JSON.stringify(registry));
  const s = service();
  await s.enable(installed);
  const summary = (await s.list()).find((p) => p.pluginId === pluginId)!;
  expect(summary.status).toBe('stored');
  expect(summary.enabled).toBe(true);
  expect(summary.treeDigest).toBe(contents.digest);
});
it('does not reread and hash unchanged plugin bytes on each runtime poll, but detects changed files', async () => {
  const installed = await install('1.0.0');
  const s = service();
  await s.enable(installed);
  const read = vi.spyOn(directoryContents, 'readPluginContents');
  const host = new PluginHostController(s, 'workspace');
  host.bindCredentials(new LocalHttpCredentials());
  const poll = () =>
    host.handle(new Request('http://localhost/plugins/runtime'), '', {});
  try {
    await poll();
    const firstReads = read.mock.calls.length;
    await poll();
    expect(read.mock.calls.length).toBe(firstReads);
    const registry = JSON.parse(
      await readFile(join(root, 'plugins/registry.json'), 'utf8')
    ) as { packages: Array<{ directory: string }> };
    await writeFile(
      join(registry.packages[0]!.directory, 'main.js'),
      'tampered code'
    );
    const response = await poll();
    expect(await response?.json()).toMatchObject({ plugins: [] });
    expect(
      (await s.list()).find((plugin) => plugin.pluginId === pluginId)?.enabled
    ).toBe(false);
  } finally {
    host.dispose();
  }
});
it('bounds cached byte verification and rejects symlink replacement even with restored mtime', async () => {
  await packageVersion('1.0.0');
  let now = 0;
  const cache = new PluginDirectoryCache(() => now, 10);
  const first = await cache.read(runtime);
  expect(await cache.read(runtime)).toBe(first);
  now = 11;
  expect(await cache.read(runtime)).not.toBe(first);
  const path = join(runtime, 'a.js');
  const before = await stat(path);
  await writeFile(path, 'export default 9');
  await utimes(path, before.atime, before.mtime);
  expect((await cache.read(runtime)).contents.digest).not.toBe(
    first.contents.digest
  );
  await rm(path);
  await symlink(join(runtime, 'main.js'), path);
  await expect(cache.read(runtime)).rejects.toThrow('Unsafe');
});
