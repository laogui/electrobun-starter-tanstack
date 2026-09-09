import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_PLUGIN_MESSAGE } from '../../shared/plugins/manifest';
import { createStoredZip, pluginFiles } from '../../test/pluginPackage';
import { PluginManagementService, pluginInstallRoot } from './management';

vi.mock('../appPaths', () => ({
  getAppDataRoot: () => {
    throw new Error('Tests must specify an application data root');
  },
}));

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'plugin-management-'));
  roots.push(root);
  const workspace = join(root, 'workspace');
  const appDataRoot = join(root, 'app');
  const file = join(root, 'example.zip');
  await writeFile(file, createStoredZip(pluginFiles()));
  const service = new PluginManagementService(workspace, { appDataRoot });
  return { root, workspace, appDataRoot, file, service };
}

describe('PluginManagementService', () => {
  it('allows disabling an enabled directory even while its manifest is broken', async () => {
    const { service, root } = await setup();
    const directory = join(root, 'broken-development');
    await mkdir(directory);
    const files = pluginFiles();
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(directory, name), content);
    }
    const preview = await service.prepareDevelopmentDirectory(directory);
    const installed = await service.commit(preview.transactionId);
    await service.enable(installed);
    const original = await readFile(join(directory, 'manifest.json'), 'utf8');
    await writeFile(join(directory, 'manifest.json'), '{broken');
    expect((await service.list())[0]).toMatchObject({
      enabled: true,
      status: 'invalid',
    });
    expect(await service.disable(installed)).toMatchObject({
      enabled: false,
      status: 'invalid',
    });
    await writeFile(join(directory, 'manifest.json'), original);
    expect((await service.list())[0]).toMatchObject({
      enabled: false,
      status: 'stored',
    });
  });

  it('persists development reviews and connections, rejects source conflicts and serializes concurrent connections', async () => {
    const { service, root, workspace, appDataRoot, file } = await setup();
    const directory = join(root, 'development');
    await mkdir(directory);
    for (const [name, content] of Object.entries(pluginFiles())) {
      await writeFile(join(directory, name), content);
    }
    const preview = await service.prepareDevelopmentDirectory(directory);
    expect(await service.list()).toEqual([]);
    const restarted = new PluginManagementService(workspace, { appDataRoot });
    const second = await restarted.prepareDevelopmentDirectory(directory);
    const results = await Promise.allSettled([
      restarted.commit(preview.transactionId),
      service.commit(second.transactionId),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(await restarted.list()).toHaveLength(1);
    await expect(service.prepareFromFile(file)).rejects.toMatchObject({
      code: 'already-installed',
    });
    expect(await service.list()).toHaveLength(1);
    const original = await readFile(
      join(appDataRoot, 'plugins', 'development-directories.json'),
      'utf8'
    );
    expect(
      (JSON.parse(original) as { connections: unknown[] }).connections
    ).toHaveLength(1);
    await service.cancel(second.transactionId);
    await writeFile(
      join(appDataRoot, 'plugins', 'development-directories.json'),
      '{broken'
    );
    await expect(
      service.prepareDevelopmentDirectory(directory)
    ).rejects.toThrow('preserved');
    expect(
      await readFile(
        join(appDataRoot, 'plugins', 'development-directories.json'),
        'utf8'
      )
    ).toBe('{broken');
    await writeFile(
      join(appDataRoot, 'plugins', 'development-directories.json'),
      original
    );
    expect(await restarted.list()).toHaveLength(1);
  });

  it('rejects installed-source collisions even when the ZIP was prepared before the directory connection', async () => {
    const { service, root, file } = await setup();
    const directory = join(root, 'development');
    await mkdir(directory);
    for (const [name, content] of Object.entries(pluginFiles())) {
      await writeFile(join(directory, name), content);
    }
    const zip = await service.prepareFromFile(file);
    const development = await service.prepareDevelopmentDirectory(directory);
    await service.commit(development.transactionId);
    await expect(service.commit(zip.transactionId)).rejects.toMatchObject({
      code: 'already-installed',
    });
    expect((await service.list())[0]?.development).toBe(true);
  });

  it('does not connect a changed review, legacy manifest or invalid entry', async () => {
    const { service, root, file } = await setup();
    const directory = join(root, 'development');
    await mkdir(directory);
    const files = pluginFiles();
    const manifestSource = files['manifest.json'];
    const entrySource = files['main.js'];
    if (!(manifestSource && entrySource)) {
      throw new Error('Test fixture must contain manifest and entry');
    }
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(directory, name), content);
    }
    const review = await service.prepareDevelopmentDirectory(directory);
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({
        ...(JSON.parse(manifestSource) as Record<string, unknown>),
        id: 'example.changed',
      })
    );
    await expect(service.commit(review.transactionId)).rejects.toThrow(
      'changed since review'
    );
    expect(await service.list()).toEqual([]);
    await service.cancel(review.transactionId);
    await expect(service.commit(review.transactionId)).rejects.toMatchObject({
      code: 'invalid-state',
    });
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({ manifestVersion: 1 })
    );
    await expect(
      service.prepareDevelopmentDirectory(directory)
    ).rejects.toThrow();
    await writeFile(join(directory, 'manifest.json'), manifestSource);
    await rm(join(directory, 'main.js'));
    await expect(
      service.prepareDevelopmentDirectory(directory)
    ).rejects.toThrow('entry');
    await writeFile(join(directory, 'main.js'), entrySource);
    const zip = await service.prepareFromFile(file);
    await service.commit(zip.transactionId);
    await expect(
      service.prepareDevelopmentDirectory(directory)
    ).rejects.toMatchObject({ code: 'already-installed' });
    expect((await service.list())[0]?.development).toBeUndefined();
  });
  it('reviews and commits at application scope without exposing paths or executing code', async () => {
    const { service, workspace, appDataRoot, file } = await setup();
    expect(pluginInstallRoot(appDataRoot)).toBe(join(appDataRoot, 'plugins'));
    expect(await service.list()).toEqual([]);
    const preview = await service.prepareFromFile(file);
    expect(preview.plugin).toMatchObject({
      id: 'community.example.app',
      capabilities: ['files'],
      signatureStatus: 'unverified',
    });
    expect(await service.list()).toEqual([]);
    const installed = await service.commit(preview.transactionId);
    expect(installed).toMatchObject({ enabled: false, status: 'stored' });
    expect(JSON.stringify(installed)).not.toContain(workspace);
    expect(
      await new PluginManagementService(`${workspace}-other`, {
        appDataRoot,
      }).list()
    ).toEqual([installed]);
  });

  it('saves opt-in workspace enablement, never importing old grants', async () => {
    const { service, workspace, appDataRoot, file } = await setup();
    const preview = await service.prepareFromFile(file);
    const installed = await service.commit(preview.transactionId);
    const input = { pluginId: installed.pluginId, digest: installed.digest };
    await expect(
      service.enable({ ...input, digest: 'stale' })
    ).rejects.toMatchObject({ code: 'not-found' });
    expect((await service.enable(input)).enabled).toBe(true);
    expect(
      (await new PluginManagementService(workspace, { appDataRoot }).list())[0]
        ?.enabled
    ).toBe(true);
    expect(
      (
        await new PluginManagementService(`${workspace}-other`, {
          appDataRoot,
        }).list()
      )[0]?.enabled
    ).toBe(false);
    expect((await service.disable(input)).enabled).toBe(false);
  });

  it('cancels inspection and refuses unsupported file types', async () => {
    const { service, file } = await setup();
    await expect(service.prepareFromFile('/missing.txt')).rejects.toMatchObject(
      { code: 'invalid-package' }
    );
    const preview = await service.prepareFromFile(file);
    await service.cancel(preview.transactionId);
    await expect(service.commit(preview.transactionId)).rejects.toMatchObject({
      code: 'invalid-state',
    });
    expect(await service.list()).toEqual([]);
  });

  it('shows legacy workspace packages without changing their files or user data', async () => {
    const { workspace, service, appDataRoot } = await setup();
    const oldRoot = join(workspace, '.ghostboard', 'plugins');
    const directory = join(
      oldRoot,
      'packages',
      'example.old',
      '1.0.0',
      'a'.repeat(64)
    );
    await mkdir(directory, { recursive: true });
    const oldManifest = JSON.stringify({
      manifestVersion: 1,
      id: 'example.old',
    });
    await writeFile(join(directory, 'ghostboard.plugin.json'), oldManifest);
    const registry = JSON.stringify({
      schema: 1,
      packages: [
        {
          pluginId: 'example.old',
          name: 'Old',
          version: '1.0.0',
          digest: 'a'.repeat(64),
          directory,
          installedAt: new Date().toISOString(),
          source: { kind: 'zip' },
        },
      ],
    });
    await writeFile(join(oldRoot, 'registry.json'), registry);
    await writeFile(join(workspace, 'canvas.json'), 'preserve canvas');
    await service.recover();
    expect(await service.list()).toMatchObject([
      {
        status: 'legacy',
        enabled: false,
        validationError: LEGACY_PLUGIN_MESSAGE,
      },
    ]);
    await expect(
      service.enable({ pluginId: 'example.old', digest: 'a'.repeat(64) })
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(await readFile(join(oldRoot, 'registry.json'), 'utf8')).toBe(
      registry
    );
    expect(
      await readFile(join(directory, 'ghostboard.plugin.json'), 'utf8')
    ).toBe(oldManifest);
    expect(await readFile(join(workspace, 'canvas.json'), 'utf8')).toBe(
      'preserve canvas'
    );
    expect(
      await new PluginManagementService(`${workspace}-other`, {
        appDataRoot,
      }).list()
    ).toEqual([]);
  });
});
