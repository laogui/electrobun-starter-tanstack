import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const moveToTrashMock = vi.fn();

vi.mock('electrobun/bun', () => ({
  Utils: {
    moveToTrash: (...args: Parameters<typeof moveToTrashMock>) =>
      moveToTrashMock(...args),
  },
}));

const setBunFile = () => {
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => ({
      text: async () => readFileSync(filePath, 'utf8'),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
      exists: async () => existsSync(filePath),
    })),
  });
};

function writeWorkspaceFixture(wsPath: string) {
  mkdirSync(join(wsPath, '.ghostboard', 'views'), { recursive: true });
  mkdirSync(join(wsPath, 'content'), { recursive: true });

  writeFileSync(
    join(wsPath, '.ghostboard', 'workspace.json'),
    JSON.stringify({
      schema: 'ghostboard-workspace/v1',
      activeViewId: 'default',
      views: [
        {
          id: 'default',
          name: 'Default Canvas',
          file: 'views/default.canvas.json',
        },
      ],
      trash: [
        {
          trashId: 'trash-1',
          trashFile: 'views/trash-1.canvas.json',
          deletedAt: new Date().toISOString(),
          view: {
            id: 'old',
            name: 'Old',
            file: 'views/old.canvas.json',
          },
        },
      ],
    })
  );

  writeFileSync(
    join(wsPath, '.ghostboard', 'views', 'default.canvas.json'),
    JSON.stringify({
      schema: 'ghostboard-canvas/v1',
      viewId: 'default',
      nodes: [
        {
          id: 'n1',
          type: 'card',
          position: { x: 0, y: 0 },
          data: { noteId: 'keep-note' },
        },
        {
          id: 'folder-1',
          type: 'folder',
          position: { x: 1, y: 1 },
          data: {
            children: [
              { id: 'child-1', type: 'card', noteId: 'child-keep' },
              {
                id: 'child-2',
                type: 'card',
                data: { noteId: 'child-data-keep' },
              },
            ],
          },
        },
      ],
      edges: [],
    })
  );

  writeFileSync(
    join(wsPath, '.ghostboard', 'views', 'trash-1.canvas.json'),
    JSON.stringify({
      schema: 'ghostboard-canvas/v1',
      viewId: 'old',
      nodes: [
        {
          id: 'old-node',
          type: 'card',
          position: { x: 0, y: 0 },
          data: { noteId: 'trash-keep' },
        },
      ],
      edges: [],
    })
  );

  writeFileSync(
    join(wsPath, 'content', 'keep-note.md'),
    '---\nid: keep-note\ntitle: Keep\n---\nkeep'
  );
  writeFileSync(
    join(wsPath, 'content', 'child-keep.md'),
    '---\nid: child-keep\ntitle: Child Keep\n---\nchild keep'
  );
  writeFileSync(
    join(wsPath, 'content', 'child-data-keep.md'),
    '---\nid: child-data-keep\ntitle: Child Data Keep\n---\nchild data keep'
  );
  writeFileSync(
    join(wsPath, 'content', 'trash-keep.md'),
    '---\nid: trash-keep\ntitle: Trash Keep\n---\ntrash keep'
  );
  writeFileSync(
    join(wsPath, 'content', 'orphan.md'),
    '---\nid: orphan\ntitle: Orphan\n---\norphan body'
  );
  writeFileSync(
    join(wsPath, 'content', 'no-id.md'),
    '---\ntitle: No Id\n---\nbody'
  );
}

describe('cleanup', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'cleanup-test-'));
    moveToTrashMock.mockReset();
    moveToTrashMock.mockReturnValue(true);
    setBunFile();
    writeWorkspaceFixture(workspaceRoot);
  });

  it('scanUnlinkedNotes returns markdown files not referenced by manifests', async () => {
    const { scanUnlinkedNotes } = await import('./cleanup');

    const result = await scanUnlinkedNotes(workspaceRoot);
    const files = result.map((entry) => entry.file);

    expect(files).toEqual(['content/no-id.md', 'content/orphan.md']);

    const orphan = result.find((entry) => entry.file === 'content/orphan.md');
    expect(orphan).toMatchObject({
      noteId: 'orphan',
      hasFrontmatterId: true,
      title: 'Orphan',
      size: statSync(join(workspaceRoot, 'content', 'orphan.md')).size,
    });

    const noId = result.find((entry) => entry.file === 'content/no-id.md');
    expect(noId).toMatchObject({
      noteId: null,
      hasFrontmatterId: false,
      title: 'No Id',
    });
  });

  it('deleteUnlinkedNotes re-validates references and skips unsafe paths', async () => {
    const { deleteUnlinkedNotes } = await import('./cleanup');

    const result = await deleteUnlinkedNotes(workspaceRoot, [
      'content/orphan.md',
      'content/keep-note.md',
      'content/../escape.md',
      'outside.md',
      'content/missing.md',
    ]);

    expect(result.deleted).toEqual(['content/orphan.md']);
    expect(result.skipped).toEqual([
      'content/keep-note.md',
      'content/../escape.md',
      'outside.md',
      'content/missing.md',
    ]);
    expect(moveToTrashMock).toHaveBeenCalledTimes(1);
    expect(moveToTrashMock).toHaveBeenCalledWith(
      join(workspaceRoot, 'content', 'orphan.md')
    );
  });

  it('treats moveToTrash failures as skipped files', async () => {
    const { deleteUnlinkedNotes } = await import('./cleanup');
    moveToTrashMock.mockReturnValue(false);

    const result = await deleteUnlinkedNotes(workspaceRoot, [
      'content/orphan.md',
    ]);

    expect(result.deleted).toEqual([]);
    expect(result.skipped).toEqual(['content/orphan.md']);
  });
});
