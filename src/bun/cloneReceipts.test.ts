import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
}));
const { trackedClone, finishClones } = await import('./cloneReceipts');
const { atomicWrite } = await import('./atomicWrite');
let ws: string;
beforeEach(async () => {
  ws = await mkdtemp(join(tmpdir(), 'clone-receipts-'));
  await mkdir(join(ws, '.ghostboard/views'), { recursive: true });
  await mkdir(join(ws, '.ghostboard/widgets'));
  await writeFile(
    join(ws, '.ghostboard/workspace.json'),
    JSON.stringify({
      schema: 'ghostboard-workspace/v1',
      activeViewId: 'default',
      views: [
        { id: 'default', name: 'Default', file: 'views/default.canvas.json' },
      ],
    })
  );
  await writeFile(
    join(ws, '.ghostboard/views/default.canvas.json'),
    JSON.stringify({ nodes: [], edges: [] })
  );
});
afterEach(async () => {
  await rm(ws, { recursive: true, force: true });
});
async function clone() {
  return (await trackedClone(ws, 'widget', async () => {
    await atomicWrite(join(ws, '.ghostboard/widgets/new.json'), 'Clone bytes');
    return { id: 'new' };
  }))!;
}
it('quarantines only an unchanged, unreferenced record created by this clone operation', async () => {
  await writeFile(join(ws, '.ghostboard/widgets/original.json'), 'Original');
  const receipt = await clone();
  expect((await finishClones(ws, ['wrong-token'], [])).removed).toEqual([]);
  expect((await finishClones(ws, [receipt.token], [])).removed).toEqual([
    'new',
  ]);
  expect(existsSync(join(ws, '.ghostboard/widgets/new.json'))).toBe(false);
  expect(
    await readFile(
      join(
        ws,
        '.ghostboard/recovery/discarded-clones',
        receipt.token,
        'new.json'
      ),
      'utf8'
    )
  ).toBe('Clone bytes');
  expect(
    await readFile(join(ws, '.ghostboard/widgets/original.json'), 'utf8')
  ).toBe('Original');
});
it.each([
  'memory',
  'manifest',
  'edited',
])('retains a clone protected by %s', async (protection) => {
  const receipt = await clone();
  if (protection === 'manifest') {
    await writeFile(
      join(ws, '.ghostboard/views/default.canvas.json'),
      JSON.stringify({
        nodes: [
          {
            id: 'n',
            type: 'widget',
            position: { x: 0, y: 0 },
            data: { widgetId: 'new' },
          },
        ],
        edges: [],
      })
    );
  }
  if (protection === 'edited') {
    await writeFile(join(ws, '.ghostboard/widgets/new.json'), 'User edit');
  }
  expect(
    (
      await finishClones(
        ws,
        [receipt.token],
        protection === 'memory' ? ['new'] : []
      )
    ).retained
  ).toEqual(['new']);
  expect(existsSync(join(ws, '.ghostboard/widgets/new.json'))).toBe(true);
});

it('does not trust a forged on-disk receipt for an original record', async () => {
  await writeFile(join(ws, '.ghostboard/widgets/original.json'), 'Original');
  const { createHash } = await import('node:crypto');
  await writeFile(
    join(ws, '.ghostboard/pending-clones.json'),
    JSON.stringify([
      {
        kind: 'widget',
        id: 'original',
        token: 'forged',
        hash: createHash('sha256').update('Original').digest('hex'),
      },
    ])
  );
  expect((await finishClones(ws, ['forged'], [])).removed).toEqual([]);
  expect(
    await readFile(join(ws, '.ghostboard/widgets/original.json'), 'utf8')
  ).toBe('Original');
});
