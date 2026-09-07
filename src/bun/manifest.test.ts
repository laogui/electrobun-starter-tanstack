import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const VIEW1_TMP_RE = /^.*view-1\.canvas\.json\.[\da-f]+\.tmp$/;
const VIEWS_OR_TRASH_RE = /views\/ or trash\//;
const RELATIVE_PATH_RE = /relative/;

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
    mkdirSync(join(workspaceRoot, '.ghostboard', 'views'), { recursive: true });
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
      '.ghostboard',
      'views',
      'default.canvas.json'
    );
    const manifest = {
      schema: 'ghostboard-canvas/v1',
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
      schema: 'ghostboard-canvas/v1' as const,
      viewId: 'view-1',
      viewport: { x: 10, y: 20, zoom: 1.5 },
      nodes: [{ id: 'n1', type: 'card', position: { x: 10, y: 10 }, data: {} }],
      edges: [],
    };

    await saveManifest(workspaceRoot, 'views/view-1.canvas.json', manifest);

    const savedPath = join(
      workspaceRoot,
      '.ghostboard',
      'views',
      'view-1.canvas.json'
    );
    // tmp filename now includes a random suffix — only assert the final destination
    expect(renameMock).toHaveBeenCalledWith(
      expect.stringMatching(VIEW1_TMP_RE),
      savedPath
    );
    await expect(
      loadManifest(workspaceRoot, 'views/view-1.canvas.json')
    ).resolves.toEqual(manifest);
  });

  it('resolveWorkspaceManifestPath rejects traversal and absolute paths', async () => {
    const { loadManifest, resolveWorkspaceManifestPath, saveManifest } =
      await import('./manifest');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      resolveWorkspaceManifestPath(workspaceRoot, '../../secrets.json')
    ).toThrow(VIEWS_OR_TRASH_RE);
    expect(() =>
      resolveWorkspaceManifestPath(workspaceRoot, '/tmp/escape.canvas.json')
    ).toThrow(RELATIVE_PATH_RE);
    expect(() =>
      resolveWorkspaceManifestPath(workspaceRoot, 'content/note.md')
    ).toThrow(VIEWS_OR_TRASH_RE);

    expect(
      resolveWorkspaceManifestPath(workspaceRoot, 'views/default.canvas.json')
    ).toBe(join(workspaceRoot, '.ghostboard', 'views', 'default.canvas.json'));
    expect(
      resolveWorkspaceManifestPath(workspaceRoot, 'trash/trash_1.canvas.json')
    ).toBe(join(workspaceRoot, '.ghostboard', 'trash', 'trash_1.canvas.json'));

    await expect(
      loadManifest(workspaceRoot, '../../secrets.json')
    ).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[manifest] Refused to load')
    );

    await expect(
      saveManifest(workspaceRoot, '../../secrets.json', {
        schema: 'ghostboard-canvas/v1',
        viewId: 'evil',
        nodes: [],
        edges: [],
      })
    ).rejects.toThrow(VIEWS_OR_TRASH_RE);
  });

  it('loadManifest returns null and reports invalid JSON content', async () => {
    const { loadManifest } = await import('./manifest');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manifestPath = join(
      workspaceRoot,
      '.ghostboard',
      'views',
      'broken.canvas.json'
    );
    writeFileSync(manifestPath, '{not json');

    await expect(
      loadManifest(workspaceRoot, 'views/broken.canvas.json')
    ).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[manifest] Failed to load')
    );
  });
});
