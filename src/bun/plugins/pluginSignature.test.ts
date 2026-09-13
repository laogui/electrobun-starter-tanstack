import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '../../shared/plugins/manifest';
import { readPluginContents } from './directoryContents';
import {
  createPluginSignaturePayload,
  PLUGIN_SIGNATURE_FILE,
  PLUGIN_SIGNATURE_SCHEMA,
  PluginSignatureError,
  verifyPluginDirectorySignature,
} from './pluginSignature';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey,
    publicKey: `ed25519-spki:${pair.publicKey
      .export({ format: 'der', type: 'spki' })
      .toString('base64')}`,
  };
}

async function signedDirectory(options?: {
  alterSignature?: boolean;
  updateUrl?: string;
}) {
  const directory = await mkdtemp(join(tmpdir(), 'plugin-signature-'));
  const key = keys();
  const manifest: PluginManifest = {
    manifestVersion: 2,
    id: 'community.example.signed',
    name: 'Signed example',
    version: '1.0.0',
    engines: { ghostboard: '>=1.0.0 <2.0.0' },
    entrypoints: { app: 'main.js' },
    capabilities: [],
    publicKey: key.publicKey,
    ...(options?.updateUrl ? { update: { url: options.updateUrl } } : {}),
  };
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(directory, 'main.js'), 'export const value = 1;');
  const treeSha256 = (await readPluginContents(directory)).digest;
  const payload = createPluginSignaturePayload({
    pluginId: manifest.id,
    version: manifest.version,
    treeSha256,
    ...(manifest.update ? { updateUrl: manifest.update.url } : {}),
  });
  const signature = sign(null, payload, key.privateKey);
  if (options?.alterSignature) {
    signature[0] = signature[0] === 0 ? 1 : 0;
  }
  await writeFile(
    join(directory, PLUGIN_SIGNATURE_FILE),
    JSON.stringify({
      schema: PLUGIN_SIGNATURE_SCHEMA,
      algorithm: 'ed25519',
      treeSha256,
      signature: signature.toString('base64'),
    })
  );
  return { directory, manifest, treeSha256 };
}

describe('plugin package signatures', () => {
  it('verifies Ed25519 over the canonical identity and unsigned tree', async () => {
    const fixture = await signedDirectory({
      updateUrl: 'https://example.com/plugin/releases.json',
    });
    await expect(
      verifyPluginDirectorySignature(fixture.directory, fixture.manifest)
    ).resolves.toEqual({
      publicKey: fixture.manifest.publicKey,
      treeSha256: fixture.treeSha256,
      updateUrl: 'https://example.com/plugin/releases.json',
    });
    expect((await readPluginContents(fixture.directory)).digest).not.toBe(
      fixture.treeSha256
    );
  });

  it('accepts a package only when both key and envelope are absent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'plugin-unsigned-'));
    const fixture = await signedDirectory();
    const manifest = { ...fixture.manifest, publicKey: undefined };
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(join(directory, 'main.js'), 'export {};');
    await expect(
      verifyPluginDirectorySignature(directory, manifest)
    ).resolves.toBeUndefined();
    await expect(
      verifyPluginDirectorySignature(fixture.directory, manifest)
    ).rejects.toBeInstanceOf(PluginSignatureError);
  });

  it('rejects altered signatures, payload identity, and tree contents', async () => {
    const altered = await signedDirectory({ alterSignature: true });
    await expect(
      verifyPluginDirectorySignature(altered.directory, altered.manifest)
    ).rejects.toThrow('verification failed');

    const identity = await signedDirectory();
    await expect(
      verifyPluginDirectorySignature(identity.directory, {
        ...identity.manifest,
        version: '1.1.0',
      })
    ).rejects.toThrow('verification failed');

    const contents = await signedDirectory();
    await writeFile(
      join(contents.directory, 'main.js'),
      'export const value = 2;'
    );
    await expect(
      verifyPluginDirectorySignature(contents.directory, contents.manifest)
    ).rejects.toThrow('tree digest does not match');
  });
});
