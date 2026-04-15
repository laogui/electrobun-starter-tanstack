import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: {
    paths: {
      userData: '/mock-user-data',
    },
  },
}));

const renameMock = vi.fn();
vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );

  return {
    ...actual,
    rename: (...args: Parameters<typeof renameMock>) => renameMock(...args),
  };
});

const setBunFile = () => {
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    })),
    write: vi.fn(writeFile),
  });
};

describe('manifest', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'manifest-test-'));
    mkdirSync(join(workspaceRoot, '.spatial', 'views'), { recursive: true });
    renameMock.mockReset();
    renameMock.mockImplementation(async (from: string, to: string) => {
      const data = await readFile(from, 'utf8');
      await writeFile(to, data);
    });
    setBunFile();
  });

  it('loadManifest returns null when the file is missing', async () => {
    const { loadManifest } = await import('./manifest');

    await expect(
      loadManifest(workspaceRoot, 'views/missing.canvas.json')
    ).resolves.toBeNull();
  });

  it('loadManifest reads an existing manifest from disk', async () => {
    const { loadManifest } = await import('./manifest');
    const manifestPath = join(
      workspaceRoot,
      '.spatial',
      'views',
      'default.canvas.json'
    );
    const manifest = {
      schema: 'spatial-canvas/v1',
      viewId: 'default',
      viewport: { x: 1, y: 2, zoom: 3 },
      nodes: [{ id: 'n1', type: 'card', position: { x: 0, y: 0 }, data: {} }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(
      loadManifest(workspaceRoot, 'views/default.canvas.json')
    ).resolves.toEqual(manifest);
  });

  it('saveManifest persists a manifest through atomicWrite', async () => {
    const { loadManifest, saveManifest } = await import('./manifest');
    const manifest = {
      schema: 'spatial-canvas/v1' as const,
      viewId: 'view-1',
      viewport: { x: 10, y: 20, zoom: 1.5 },
      nodes: [{ id: 'n1', type: 'card', position: { x: 10, y: 10 }, data: {} }],
      edges: [],
    };

    await saveManifest(workspaceRoot, 'views/view-1.canvas.json', manifest);

    const savedPath = join(
      workspaceRoot,
      '.spatial',
      'views',
      'view-1.canvas.json'
    );
    // tmp filename now includes a random suffix — only assert the final destination
    expect(renameMock).toHaveBeenCalledWith(
      expect.stringMatching(/^.*view-1\.canvas\.json\.[\da-f]+\.tmp$/),
      savedPath
    );
    await expect(
      loadManifest(workspaceRoot, 'views/view-1.canvas.json')
    ).resolves.toEqual(manifest);
  });

  it('loadManifest rejects invalid JSON content', async () => {
    const { loadManifest } = await import('./manifest');
    const manifestPath = join(
      workspaceRoot,
      '.spatial',
      'views',
      'broken.canvas.json'
    );
    writeFileSync(manifestPath, '{not json');

    await expect(
      loadManifest(workspaceRoot, 'views/broken.canvas.json')
    ).rejects.toThrow();
  });
});
