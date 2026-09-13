import {
  createHash,
  generateKeyPairSync,
  type KeyObject,
  sign,
} from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
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
import {
  PLUGIN_PACKAGE_DIGEST_RE,
  PluginInstallError,
  PluginInstallStore,
} from './pluginInstall';
import {
  createPluginSignaturePayload,
  PLUGIN_SIGNATURE_FILE,
  PLUGIN_SIGNATURE_SCHEMA,
} from './pluginSignature';

interface SigningKeys {
  privateKey: KeyObject;
  publicKey: string;
}

function signingKeys(): SigningKeys {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey,
    publicKey: `ed25519-spki:${pair.publicKey
      .export({ format: 'der', type: 'spki' })
      .toString('base64')}`,
  };
}

function signedPluginZip(input: {
  keys: SigningKeys;
  main?: string;
  updateUrl?: string;
  version: string;
}): Uint8Array {
  const manifest = {
    manifestVersion: 2,
    id: 'community.example.app',
    name: 'Example app',
    version: input.version,
    engines: { ghostboard: '>=1.0.0 <2.0.0' },
    entrypoints: { app: 'main.js' },
    capabilities: ['files'],
    publicKey: input.keys.publicKey,
    ...(input.updateUrl ? { update: { url: input.updateUrl } } : {}),
  };
  const files: Record<string, string> = {
    'manifest.json': JSON.stringify(manifest),
    'main.js': input.main ?? 'export const version = 1;',
  };
  const hash = createHash('sha256');
  for (const path of Object.keys(files).sort()) {
    const bytes = new TextEncoder().encode(files[path]);
    hash.update(JSON.stringify([path, bytes.byteLength]));
    hash.update(bytes);
  }
  const treeSha256 = hash.digest('hex');
  files[PLUGIN_SIGNATURE_FILE] = JSON.stringify({
    schema: PLUGIN_SIGNATURE_SCHEMA,
    algorithm: 'ed25519',
    treeSha256,
    signature: sign(
      null,
      createPluginSignaturePayload({
        pluginId: manifest.id,
        version: manifest.version,
        treeSha256,
        ...(manifest.update ? { updateUrl: manifest.update.url } : {}),
      }),
      input.keys.privateKey
    ).toString('base64'),
  });
  return createStoredZip(files);
}

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

  it('refuses commit when unpacked files change after signature review', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-staging-edit-'));
    const store = new PluginInstallStore(root);
    const prepared = await store.prepareFromZip({
      zipBytes: signedPluginZip({
        keys: signingKeys(),
        version: '1.0.0',
      }),
    });
    await writeFile(
      join(prepared.directory, 'main.js'),
      'export const edited = true;'
    );
    await expect(store.commit(prepared.transactionId)).rejects.toMatchObject({
      code: 'replaced',
    });
    expect((await store.getJournal(prepared.transactionId))?.stage).toBe(
      'failed'
    );
    expect(existsSync(join(root, 'staging', prepared.transactionId))).toBe(
      false
    );
    expect(await store.listInstalled()).toEqual([]);
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
  it('refuses to replace an unsigned install in place', async () => {
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
    ).rejects.toMatchObject({ code: 'signature-required' });
    expect((await store.listInstalled()).map((item) => item.version)).toEqual([
      '1.0.0',
    ]);
  });

  it('records a verified author identity for a signed first install', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-signed-'));
    const store = new PluginInstallStore(root);
    const keys = signingKeys();
    const prepared = await store.prepareFromZip({
      zipBytes: signedPluginZip({
        keys,
        version: '1.0.0',
        updateUrl: 'https://example.com/releases.json',
      }),
    });
    expect(prepared.signature).toMatchObject({
      publicKey: keys.publicKey,
      updateUrl: 'https://example.com/releases.json',
    });
    const installed = await store.commit(prepared.transactionId);
    expect(installed.signature).toEqual(prepared.signature);
    expect((await store.getJournal(prepared.transactionId))?.signature).toEqual(
      prepared.signature
    );
  });

  it('atomically advances a signed plugin with the same TOFU identity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-update-signed-'));
    const store = new PluginInstallStore(root);
    const keys = signingKeys();
    const updateUrl = 'https://example.com/releases.json';
    const first = await store.prepareFromZip({
      zipBytes: signedPluginZip({ keys, version: '1.0.0', updateUrl }),
    });
    const old = await store.commit(first.transactionId);
    const update = await store.prepareFromZip({
      zipBytes: signedPluginZip({
        keys,
        version: '1.1.0',
        updateUrl,
        main: 'export const version = 2;',
      }),
    });
    const current = await store.commit(update.transactionId);
    expect(current.version).toBe('1.1.0');
    expect(current.previous).toMatchObject({
      digest: old.digest,
      version: '1.0.0',
    });
    expect(current.signature?.publicKey).toBe(keys.publicKey);
    expect(await store.listInstalled()).toEqual([current]);
    expect(existsSync(old.directory)).toBe(true);
    expect(old.directory).not.toBe(current.directory);
  });

  it('explicitly rolls back to the retained verified code generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-rollback-'));
    const store = new PluginInstallStore(root);
    const keys = signingKeys();
    const updateUrl = 'https://example.com/releases.json';
    const first = await store.prepareFromZip({
      zipBytes: signedPluginZip({ keys, version: '1.0.0', updateUrl }),
    });
    const old = await store.commit(first.transactionId);
    const update = await store.prepareFromZip({
      zipBytes: signedPluginZip({
        keys,
        version: '1.1.0',
        updateUrl,
        main: 'export const version = 2;',
      }),
    });
    const current = await store.commit(update.transactionId);

    const restored = await store.rollback({
      pluginId: current.pluginId,
      digest: current.digest,
    });
    expect(restored).toMatchObject({
      digest: old.digest,
      version: '1.0.0',
    });
    expect(restored.previous).toBeUndefined();
    expect(await store.listInstalled()).toEqual([restored]);

    await store.recover();
    expect(await store.listInstalled()).toEqual([restored]);
    await expect(
      store.rollback({
        pluginId: restored.pluginId,
        digest: restored.digest,
      })
    ).rejects.toMatchObject({ code: 'rollback-unavailable' });
  });

  it('refuses rollback when the retained code was changed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-bad-rollback-'));
    const store = new PluginInstallStore(root);
    const keys = signingKeys();
    const updateUrl = 'https://example.com/releases.json';
    const first = await store.prepareFromZip({
      zipBytes: signedPluginZip({ keys, version: '1.0.0', updateUrl }),
    });
    const old = await store.commit(first.transactionId);
    const update = await store.prepareFromZip({
      zipBytes: signedPluginZip({
        keys,
        version: '1.1.0',
        updateUrl,
        main: 'export const version = 2;',
      }),
    });
    const current = await store.commit(update.transactionId);
    await writeFile(join(old.directory, 'main.js'), '// changed\n');

    await expect(
      store.rollback({
        pluginId: current.pluginId,
        digest: current.digest,
      })
    ).rejects.toMatchObject({ code: 'integrity' });
    expect((await store.listInstalled())[0]).toMatchObject({
      digest: current.digest,
      version: '1.1.0',
    });
  });

  it('rejects a changed author key or update source and keeps the old version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-tofu-'));
    const store = new PluginInstallStore(root);
    const keys = signingKeys();
    const first = await store.prepareFromZip({
      zipBytes: signedPluginZip({
        keys,
        version: '1.0.0',
        updateUrl: 'https://example.com/releases.json',
      }),
    });
    const installed = await store.commit(first.transactionId);

    await expect(
      store.prepareFromZip({
        zipBytes: signedPluginZip({
          keys: signingKeys(),
          version: '1.1.0',
          updateUrl: 'https://example.com/releases.json',
        }),
      })
    ).rejects.toMatchObject({ code: 'author-key-changed' });
    await expect(
      store.prepareFromZip({
        zipBytes: signedPluginZip({
          keys,
          version: '1.1.0',
          updateUrl: 'https://mirror.example.com/releases.json',
        }),
      })
    ).rejects.toMatchObject({ code: 'update-source-changed' });
    expect(await store.listInstalled()).toEqual([installed]);
  });

  it('rejects a package changed after signing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-bad-signature-'));
    const store = new PluginInstallStore(root);
    const keys = signingKeys();
    const valid = signedPluginZip({ keys, version: '1.0.0' });
    const staging = await mkdtemp(join(tmpdir(), 'plugin-signature-unpack-'));
    const unpacked = await import('./zipInstall').then(({ unpackPluginZip }) =>
      unpackPluginZip(valid, staging)
    );
    const files = pluginFiles();
    files['manifest.json'] = await readFile(
      join(unpacked.pluginRoot, 'manifest.json'),
      'utf8'
    );
    files['main.js'] = 'export const changed = true;';
    files[PLUGIN_SIGNATURE_FILE] = await readFile(
      join(unpacked.pluginRoot, PLUGIN_SIGNATURE_FILE),
      'utf8'
    );
    await expect(
      store.prepareFromZip({ zipBytes: createStoredZip(files) })
    ).rejects.toMatchObject({ code: 'invalid-package' });
    expect(await store.listInstalled()).toEqual([]);
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

describe('registry corruption recovery', () => {
  async function installOne() {
    const root = await mkdtemp(join(tmpdir(), 'plugin-install-corrupt-'));
    const store = new PluginInstallStore(root);
    const prepared = await store.prepareFromZip({
      zipBytes: createStoredZip(pluginFiles()),
    });
    const installed = await store.commit(prepared.transactionId);
    return { installed, root, store };
  }

  async function corruptBackup(root: string): Promise<string> {
    const name = (await readdir(root)).find((entry) =>
      entry.startsWith('registry.json.corrupt-')
    );
    if (!name) {
      throw new Error(
        `no preserved registry in ${(await readdir(root)).join(', ')}`
      );
    }
    return join(root, name);
  }

  it('rebuilds the registry from journals and the packages tree', async () => {
    const { installed, root } = await installOne();
    await writeFile(join(root, 'registry.json'), '{"schema":1,"packa');

    const reopened = new PluginInstallStore(root);
    // installedAt comes from the journal, so it may differ by milliseconds
    // from the timestamp the lost registry recorded. treeDigest is deliberately
    // not rebuilt: adopting the current tree is trust on first use and belongs
    // in the single place that already does it.
    const { installedAt, treeDigest, ...identity } = installed;
    const rebuilt = await reopened.listInstalled();
    expect(rebuilt).toMatchObject([identity]);
    expect(rebuilt[0]?.treeDigest).toBeUndefined();
    expect(installedAt).toBeTruthy();
    expect(treeDigest).toMatch(PLUGIN_PACKAGE_DIGEST_RE);
    expect(await readFile(await corruptBackup(root), 'utf8')).toBe(
      '{"schema":1,"packa'
    );
    expect(reopened.diagnostic()?.message).toContain('rebuilt');
  });

  it('drops registry entries whose package directory is gone', async () => {
    const { installed, root } = await installOne();
    await rm(join(root, 'packages'), { force: true, recursive: true });
    await writeFile(join(root, 'registry.json'), 'not json at all');

    const reopened = new PluginInstallStore(root);
    expect(await reopened.listInstalled()).toEqual([]);
    expect(installed.pluginId).toBeTruthy();
  });

  it('clears the diagnostic once the rebuilt registry reads cleanly', async () => {
    const { root } = await installOne();
    await writeFile(join(root, 'registry.json'), '<html>');

    const reopened = new PluginInstallStore(root);
    await reopened.listInstalled();
    expect(reopened.diagnostic()).toBeDefined();
    await reopened.listInstalled();
    expect(reopened.diagnostic()).toBeUndefined();
  });

  it('rebuilds only the latest verified version when rollback files remain', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'plugin-install-rebuild-update-')
    );
    const store = new PluginInstallStore(root);
    const keys = signingKeys();
    const updateUrl = 'https://example.com/releases.json';
    const first = await store.prepareFromZip({
      zipBytes: signedPluginZip({ keys, updateUrl, version: '1.0.0' }),
    });
    const old = await store.commit(first.transactionId);
    const second = await store.prepareFromZip({
      zipBytes: signedPluginZip({
        keys,
        updateUrl,
        version: '1.1.0',
        main: 'export const version = 2;',
      }),
    });
    const current = await store.commit(second.transactionId);
    expect(existsSync(old.directory)).toBe(true);
    await writeFile(join(root, 'registry.json'), '{broken');

    const rebuilt = await new PluginInstallStore(root).listInstalled();
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0]).toMatchObject({
      digest: current.digest,
      version: '1.1.0',
      signature: { publicKey: keys.publicKey, updateUrl },
      previous: { digest: old.digest, version: '1.0.0' },
    });
  });
});
