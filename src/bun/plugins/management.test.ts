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
