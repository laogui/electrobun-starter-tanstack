import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  buildPluginPackage,
  generateSigningKey,
} from '../../../packages/plugin-sdk/package-plugin.js';
import { PluginInstallStore } from './pluginInstall';

const PUBLIC_KEY_RE = /^ed25519-spki:/;

async function writeRuntime(directory: string, publicKey?: string) {
  await writeFile(
    join(directory, 'manifest.json'),
    `${JSON.stringify(
      {
        manifestVersion: 2,
        id: 'community.example.packer-signed',
        name: 'Packer signed',
        version: '1.0.0',
        engines: { ghostboard: '>=1.0.0 <2.0.0' },
        entrypoints: { app: 'main.js' },
        capabilities: [],
        ...(publicKey ? { publicKey } : {}),
        update: { url: 'https://example.com/releases.json' },
      },
      null,
      2
    )}\n`
  );
  await writeFile(join(directory, 'main.js'), 'export const signed = true;\n');
}

describe('public plugin packer signing', () => {
  it('generates a key and produces a deterministic host-verifiable package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-packer-signature-'));
    const runtime = join(root, 'runtime');
    await mkdir(runtime);
    const privateKey = join(root, 'author-key.pem');
    const keyResult = await generateSigningKey(privateKey);
    expect(keyResult.privateKey).toBe(privateKey);
    expect(keyResult.publicKey).toMatch(PUBLIC_KEY_RE);
    expect(await readFile(privateKey, 'utf8')).toContain('PRIVATE KEY');
    await writeRuntime(runtime, keyResult.publicKey);

    const first = join(root, 'first.ghostboard-plugin');
    const second = join(root, 'second.ghostboard-plugin');
    for (const output of [first, second]) {
      const packed = await buildPluginPackage({
        source: runtime,
        output,
        privateKey,
      });
      expect(packed).toMatchObject({
        signatureStatus: 'signed',
        pluginId: 'community.example.packer-signed',
      });
    }
    expect(await readFile(first)).toEqual(await readFile(second));

    const store = new PluginInstallStore(join(root, 'install'));
    const prepared = await store.prepareFromZip({
      zipBytes: Uint8Array.from(await readFile(first)),
    });
    expect(prepared.signature).toMatchObject({
      publicKey: keyResult.publicKey,
      updateUrl: 'https://example.com/releases.json',
    });
    const installed = await store.commit(prepared.transactionId);
    expect(installed.signature).toEqual(prepared.signature);
  });

  it('does not overwrite keys or sign with a mismatched or packaged key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-packer-key-safety-'));
    const runtime = join(root, 'runtime');
    await mkdir(runtime);
    const firstKey = join(root, 'first.pem');
    const secondKey = join(root, 'second.pem');
    const first = await generateSigningKey(firstKey);
    await generateSigningKey(secondKey);
    const firstPublicKey = first.publicKey;
    await writeRuntime(runtime, firstPublicKey);

    await expect(generateSigningKey(firstKey)).rejects.toThrow();

    await expect(
      buildPluginPackage({
        source: runtime,
        output: join(root, 'bad.zip'),
        privateKey: secondKey,
      })
    ).rejects.toThrow('does not match');

    const keyInsideRuntime = join(runtime, 'author.pem');
    await writeFile(
      keyInsideRuntime,
      Uint8Array.from(await readFile(firstKey))
    );
    await expect(
      buildPluginPackage({
        source: runtime,
        output: join(root, 'leak.zip'),
        privateKey: keyInsideRuntime,
      })
    ).rejects.toThrow('outside the runtime directory');
  });

  it('requires --sign when manifest declares an author key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-packer-require-sign-'));
    const runtime = join(root, 'runtime');
    await mkdir(runtime);
    const privateKey = join(root, 'author.pem');
    const { publicKey } = await generateSigningKey(privateKey);
    await writeRuntime(runtime, publicKey);
    await expect(
      buildPluginPackage({
        source: runtime,
        output: join(root, 'unsigned.zip'),
      })
    ).rejects.toThrow('publicKey requires --sign');
  });
});
