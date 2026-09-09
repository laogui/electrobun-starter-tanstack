import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { createStoredZip, pluginFiles } from '../../test/pluginPackage';
import { loadPluginDirectory } from './loadDirectory';
import { PluginInstallError, PluginInstallStore } from './pluginInstall';

async function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected tcp address');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

describe('plugin install journal', () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closers.length > 0) {
      const close = closers.pop();
      await close?.();
    }
  });

  it('commits a zip into packages/<id>/<version>/<digest>', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-'));
    const store = new PluginInstallStore(root);
    const prepared = await store.prepareFromZip({
      zipBytes: createStoredZip(pluginFiles()),
    });
    expect(prepared.pluginId).toBe('community.example.app');
    expect(prepared.version).toBe('1.0.0');
    expect(prepared.journal.stage).toBe('ready-to-commit');
    expect(existsSync(join(root, 'staging', prepared.transactionId))).toBe(
      true
    );

    const installed = await store.commit(prepared.transactionId);
    expect(installed.directory).toBe(
      join(root, 'packages', 'community.example.app', '1.0.0', prepared.digest)
    );
    expect(existsSync(join(installed.directory, 'manifest.json'))).toBe(true);
    expect(existsSync(join(root, 'staging', prepared.transactionId))).toBe(
      false
    );
    const loaded = await loadPluginDirectory(installed.directory);
    expect(loaded.sources['main.js']).toBe(pluginFiles()['main.js']);
    const listed = await store.listInstalled();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.digest).toBe(prepared.digest);
    const journal = await store.getJournal(prepared.transactionId);
    expect(journal?.stage).toBe('installed');
    await store.recover();
    expect((await store.getJournal(prepared.transactionId))?.stage).toBe(
      'installed'
    );
    expect(await store.listInstalled()).toHaveLength(1);
  });

  it('commits a wrapping-folder zip without keeping the wrap name', async () => {
    const files = pluginFiles();
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-wrap-'));
    const store = new PluginInstallStore(root);
    const prepared = await store.prepareFromZip({
      zipBytes: createStoredZip({
        'title-tools/manifest.json': files['manifest.json']!,
        'title-tools/main.js': files['main.js']!,
      }),
    });
    const installed = await store.commit(prepared.transactionId);
    expect(existsSync(join(installed.directory, 'manifest.json'))).toBe(true);
    expect(existsSync(join(installed.directory, 'title-tools'))).toBe(false);
  });

  it('rejects a second install of the same digest', async () => {
    const zipBytes = createStoredZip(pluginFiles());
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-dup-'));
    const store = new PluginInstallStore(root);
    const prepared = await store.prepareFromZip({ zipBytes });
    await store.commit(prepared.transactionId);
    await expect(store.prepareFromZip({ zipBytes })).rejects.toMatchObject({
      code: 'already-installed',
    });
    expect(await store.listInstalled()).toHaveLength(1);
  });

  it('rejects the same version with a different digest', async () => {
    const files = pluginFiles();
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-conflict-'));
    const store = new PluginInstallStore(root);
    const first = await store.prepareFromZip({
      zipBytes: createStoredZip(files),
    });
    await store.commit(first.transactionId);
    await expect(
      store.prepareFromZip({
        zipBytes: createStoredZip({
          ...files,
          'main.js': `${files['main.js']}\n`,
        }),
      })
    ).rejects.toMatchObject({ code: 'digest-conflict' });
  });

  it('cancels a prepared install and allows a later retry', async () => {
    const zipBytes = createStoredZip(pluginFiles());
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-cancel-'));
    const store = new PluginInstallStore(root);
    const prepared = await store.prepareFromZip({ zipBytes });
    const cancelled = await store.cancel(prepared.transactionId);
    expect(cancelled.stage).toBe('cancelled');
    expect(existsSync(join(root, 'staging', prepared.transactionId))).toBe(
      false
    );
    expect(await store.listInstalled()).toHaveLength(0);
    const retry = await store.prepareFromZip({ zipBytes });
    expect(retry.journal.stage).toBe('ready-to-commit');
    await store.commit(retry.transactionId);
    expect(await store.listInstalled()).toHaveLength(1);
  });

  it('records a failed journal for an invalid zip and leaves registry empty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-bad-'));
    const store = new PluginInstallStore(root);
    await expect(
      store.prepareFromZip({
        zipBytes: createStoredZip({ 'readme.txt': 'not a plugin' }),
      })
    ).rejects.toMatchObject({ code: 'invalid-package' });
    expect(await store.listInstalled()).toHaveLength(0);
    const journalNames = await readdir(join(root, 'journals'));
    expect(journalNames).toHaveLength(1);
    const journal = JSON.parse(
      await readFile(join(root, 'journals', journalNames[0]!), 'utf8')
    ) as { stage: string };
    expect(journal.stage).toBe('failed');
    expect(await readdir(join(root, 'staging'))).toEqual([]);
  });

  it('reuses an identical pending prepare while one is ready to commit', async () => {
    const zipBytes = createStoredZip(pluginFiles());
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-pending-'));
    const store = new PluginInstallStore(root);
    const first = await store.prepareFromZip({ zipBytes });
    const second = await store.prepareFromZip({ zipBytes });
    expect(second.transactionId).toBe(first.transactionId);
    expect(second.digest).toBe(first.digest);
    expect(second.manifest.id).toBe(first.manifest.id);
    expect(await readdir(join(root, 'staging'))).toEqual([first.transactionId]);
  });

  it('cancels uncommitted staging on recover', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-recover-'));
    const store = new PluginInstallStore(root);
    const prepared = await store.prepareFromZip({
      zipBytes: createStoredZip(pluginFiles()),
    });
    const recovered = await store.recover();
    const journal = recovered.find(
      (entry) => entry.transactionId === prepared.transactionId
    );
    expect(journal?.stage).toBe('cancelled');
    expect(existsSync(join(root, 'staging', prepared.transactionId))).toBe(
      false
    );
    expect(await store.listInstalled()).toHaveLength(0);
  });

  it('finishes a committing journal whose package dir already exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-crash-'));
    const store = new PluginInstallStore(root);
    const prepared = await store.prepareFromZip({
      zipBytes: createStoredZip(pluginFiles()),
    });
    const dest = join(
      root,
      'packages',
      prepared.pluginId,
      prepared.version,
      prepared.digest
    );
    await mkdir(join(root, 'packages', prepared.pluginId, prepared.version), {
      recursive: true,
    });
    await rename(prepared.directory, dest);
    const journalPath = join(
      root,
      'journals',
      `${prepared.transactionId}.json`
    );
    const raw = JSON.parse(await readFile(journalPath, 'utf8')) as {
      stage: string;
    };
    raw.stage = 'committing';
    await writeFile(journalPath, `${JSON.stringify(raw, null, 2)}\n`);
    await store.recover();
    const listed = await store.listInstalled();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.directory).toBe(dest);
    expect((await store.getJournal(prepared.transactionId))?.stage).toBe(
      'installed'
    );
  });

  it('downloads a loopback zip and redacts query credentials in the journal', async () => {
    const zip = createStoredZip(pluginFiles());
    const server = await listen((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/zip' });
      res.end(Buffer.from(zip));
    });
    closers.push(server.close);
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-url-'));
    const store = new PluginInstallStore(root);
    const prepared = await store.prepareFromUrl({
      url: `${server.baseUrl}/plugin.zip?token=secret`,
      allowLoopback: true,
    });
    expect(prepared.journal.source).toEqual({
      kind: 'url',
      origin: server.baseUrl,
      path: '/plugin.zip',
    });
    const installed = await store.commit(prepared.transactionId);
    expect(installed.source).toEqual(prepared.journal.source);
    expect(JSON.stringify(installed)).not.toContain('secret');
  });

  it('refuses commit when the staged zip is replaced', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-replaced-'));
    const store = new PluginInstallStore(root);
    const prepared = await store.prepareFromZip({
      zipBytes: createStoredZip(pluginFiles()),
    });
    await writeFile(
      join(root, 'staging', prepared.transactionId, 'package.zip'),
      createStoredZip({ 'manifest.json': '{}' })
    );
    await expect(store.commit(prepared.transactionId)).rejects.toMatchObject({
      code: 'replaced',
    });
    expect(await store.listInstalled()).toHaveLength(0);
  });

  it('does not cancel an installed package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-nocancel-'));
    const store = new PluginInstallStore(root);
    const prepared = await store.prepareFromZip({
      zipBytes: createStoredZip(pluginFiles()),
    });
    await store.commit(prepared.transactionId);
    await expect(store.cancel(prepared.transactionId)).rejects.toBeInstanceOf(
      PluginInstallError
    );
    await expect(store.cancel(prepared.transactionId)).rejects.toMatchObject({
      code: 'invalid-state',
    });
  });
  it('refuses replacement with another version until signed updates exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-update-'));
    const store = new PluginInstallStore(root);
    const files = pluginFiles();
    const prepared = await store.prepareFromZip({
      zipBytes: createStoredZip(files),
    });
    await store.commit(prepared.transactionId);
    const manifest = JSON.parse(files['manifest.json']!) as Record<
      string,
      unknown
    >;
    manifest.version = '1.1.0';
    files['manifest.json'] = JSON.stringify(manifest);
    await expect(
      store.prepareFromZip({ zipBytes: createStoredZip(files) })
    ).rejects.toMatchObject({ code: 'invalid-state' });
    expect((await store.listInstalled()).map((item) => item.version)).toEqual([
      '1.0.0',
    ]);
  });
  it('rejects a legacy package without changing the installed registry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-legacy-'));
    const store = new PluginInstallStore(root);
    const files = pluginFiles();
    files['manifest.json'] = JSON.stringify({ manifestVersion: 1 });
    await expect(
      store.prepareFromZip({ zipBytes: createStoredZip(files) })
    ).rejects.toMatchObject({ code: 'invalid-package' });
    expect(await store.listInstalled()).toEqual([]);
  });
});
