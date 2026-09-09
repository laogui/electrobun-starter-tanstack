import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pluginFiles } from '../../test/pluginPackage';
import { loadPluginDirectory } from './loadDirectory';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'plugin-directory-'));
  roots.push(root);
  const directory = join(root, 'package');
  await mkdir(directory);
  for (const [name, content] of Object.entries(pluginFiles())) {
    await writeFile(join(directory, name), content);
  }
  return { root, directory };
}

describe('v2 directory inspection', () => {
  it('does not execute modules or enforce imports as a permission sandbox', async () => {
    const { directory } = await setup();
    await writeFile(
      join(directory, 'main.js'),
      'import fs from "node:fs"; throw new Error("do not execute");'
    );
    expect(
      (await loadPluginDirectory(directory)).manifest.manifestVersion
    ).toBe(2);
  });

  it('refuses legacy manifests under either filename', async () => {
    const { directory } = await setup();
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({ manifestVersion: 1 })
    );
    await expect(loadPluginDirectory(directory)).rejects.toMatchObject({
      code: 'legacy-contract',
    });
    await rm(join(directory, 'manifest.json'));
    await writeFile(join(directory, 'ghostboard.plugin.json'), '{}');
    await expect(loadPluginDirectory(directory)).rejects.toMatchObject({
      code: 'legacy-contract',
    });
  });

  it('refuses a missing entry and a symlink outside the package', async () => {
    const { root, directory } = await setup();
    await rm(join(directory, 'main.js'));
    await expect(loadPluginDirectory(directory)).rejects.toMatchObject({
      code: 'missing-entry',
    });
    await writeFile(join(root, 'outside.js'), 'export default {}');
    await symlink(join(root, 'outside.js'), join(directory, 'main.js'));
    await expect(loadPluginDirectory(directory)).rejects.toMatchObject({
      code: 'missing-entry',
    });
  });
});
