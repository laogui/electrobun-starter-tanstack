import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { atomicWrite } from './atomicWrite';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))
  );
});

async function scratch(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'atomic-write-'));
  roots.push(root);
  return root;
}

describe('atomicWrite', () => {
  it('replaces the target and leaves no temporary file behind', async () => {
    const root = await scratch();
    const path = join(root, 'state.json');
    await atomicWrite(path, 'first');
    await atomicWrite(path, 'second');
    expect(await readFile(path, 'utf8')).toBe('second');
    expect(await readdir(root)).toEqual(['state.json']);
  });

  it('creates missing parent directories', async () => {
    const root = await scratch();
    const path = join(root, 'a', 'b', 'state.json');
    await atomicWrite(path, 'nested');
    expect(await readFile(path, 'utf8')).toBe('nested');
  });

  it.skipIf(process.platform === 'win32')(
    'creates the file with the requested mode instead of chmod afterwards',
    async () => {
      const root = await scratch();
      const path = join(root, 'secret.json');
      await atomicWrite(path, '{"k":1}', { mode: 0o600 });
      // biome-ignore lint/suspicious/noBitwiseOperators: permission mask
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
  );

  it('removes the temporary file when the final rename fails', async () => {
    const root = await scratch();
    const path = join(root, 'occupied');
    // A non-empty directory at the target makes rename(2) fail.
    await mkdir(join(path, 'child'), { recursive: true });
    await expect(atomicWrite(path, 'data')).rejects.toThrow();
    expect(await readdir(root)).toEqual(['occupied']);
  });
});
