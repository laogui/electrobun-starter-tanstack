import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { readJsonOrEmpty } from './corruptFile';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))
  );
});

async function scratch(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'corrupt-file-'));
  roots.push(root);
  return root;
}

function requireCount(value: unknown): { count: number } {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { count?: unknown }).count !== 'number'
  ) {
    throw new Error('not a count file');
  }
  return { count: (value as { count: number }).count };
}

describe('readJsonOrEmpty', () => {
  it('reports a missing file as empty without writing anything', async () => {
    const root = await scratch();
    const read = await readJsonOrEmpty(join(root, 'state.json'), requireCount);
    expect(read.kind).toBe('empty');
    expect(await readdir(root)).toEqual([]);
  });

  it('parses a well formed file', async () => {
    const root = await scratch();
    const path = join(root, 'state.json');
    await writeFile(path, JSON.stringify({ count: 3 }));
    const read = await readJsonOrEmpty(path, requireCount);
    expect(read).toMatchObject({ kind: 'ok', value: { count: 3 } });
  });

  it('preserves the original bytes when the json is truncated', async () => {
    const root = await scratch();
    const path = join(root, 'state.json');
    await writeFile(path, '{"count": 3');
    const read = await readJsonOrEmpty(path, requireCount);
    if (read.kind !== 'corrupt') {
      throw new Error(`expected corrupt, got ${read.kind}`);
    }
    expect(await readFile(read.backupPath, 'utf8')).toBe('{"count": 3');
    expect(await readFile(path, 'utf8')).toBe('{"count": 3');
  });

  it('treats a schema mismatch as corruption rather than empty', async () => {
    const root = await scratch();
    const path = join(root, 'state.json');
    await writeFile(path, JSON.stringify({ count: 'three' }));
    const read = await readJsonOrEmpty(path, requireCount);
    expect(read.kind).toBe('corrupt');
  });

  it('reuses one backup when the same damaged file is read repeatedly', async () => {
    const root = await scratch();
    const path = join(root, 'state.json');
    await writeFile(path, 'not json');
    const first = await readJsonOrEmpty(path, requireCount);
    const second = await readJsonOrEmpty(path, requireCount);
    expect(second).toMatchObject({ kind: 'corrupt' });
    expect((second as { backupPath: string }).backupPath).toBe(
      (first as { backupPath: string }).backupPath
    );
    const backups = (await readdir(root)).filter((name) =>
      name.includes('.corrupt-')
    );
    expect(backups).toHaveLength(1);
  });

  it('keeps a second backup when the file is damaged differently', async () => {
    const root = await scratch();
    const path = join(root, 'state.json');
    await writeFile(path, 'first damage');
    await readJsonOrEmpty(path, requireCount);
    await writeFile(path, 'second damage');
    await readJsonOrEmpty(path, requireCount);
    const backups = (await readdir(root)).filter((name) =>
      name.includes('.corrupt-')
    );
    expect(backups).toHaveLength(2);
  });
});
