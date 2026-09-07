import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  REACHABILITY_CASES,
  REACHABILITY_EXTENSION_ID,
  REACHABILITY_EXTENSION_MARKER,
  REACHABILITY_FOLDER_ID,
  REACHABILITY_GROUP_ID,
  REACHABILITY_VIEW_ID,
  REACHABILITY_VIEW_NAME,
  REACHABILITY_WIDGET_ID,
  REACHABILITY_WIDGET_MARKER,
  targetForReachabilityCase,
  UNLINKED_REACHABILITY_CASES,
} from '../test/reachabilityMatrix';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
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
  const fs = require('node:fs') as typeof import('node:fs');
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => ({
      exists: async () => fs.existsSync(filePath),
      text: async () => fs.readFileSync(filePath, 'utf8'),
      json: async () => JSON.parse(fs.readFileSync(filePath, 'utf8')),
    })),
    write: vi.fn(writeFile),
  });
};

interface ManifestNodeFixture {
  data: Record<string, unknown>;
  id: string;
  parentId?: string;
  position: { x: number; y: number };
  type: string;
}

interface ManifestEdgeFixture {
  data?: { label?: string };
  id: string;
  label?: string;
  source: string;
  target: string;
}

function writeWorkspace(
  ws: string,
  options: {
    views: Array<{ id: string; name: string; file: string }>;
    activeViewId: string;
    manifests: Record<
      string,
      { nodes: ManifestNodeFixture[]; edges?: ManifestEdgeFixture[] }
    >;
    notes?: Record<
      string,
      {
        id: string;
        title?: string;
        tag?: string;
        tags?: string[];
        body: string;
      }
    >;
  }
) {
  mkdirSync(join(ws, '.ghostboard', 'views'), { recursive: true });
  mkdirSync(join(ws, 'content'), { recursive: true });
  writeFileSync(
    join(ws, '.ghostboard', 'workspace.json'),
    JSON.stringify({
      schema: 'ghostboard-workspace/v1',
      activeViewId: options.activeViewId,
      views: options.views,
    })
  );
  for (const view of options.views) {
    const m = options.manifests[view.id];
    if (!m) {
      continue;
    }
    writeFileSync(
      join(ws, '.ghostboard', view.file),
      JSON.stringify({
        schema: 'ghostboard-canvas/v1',
        viewId: view.id,
        nodes: m.nodes,
        edges: m.edges ?? [],
      })
    );
  }
  if (options.notes) {
    for (const [filename, note] of Object.entries(options.notes)) {
      const fmLines = [`id: ${note.id}`];
      if (note.title) {
        fmLines.push(`title: ${note.title}`);
      }
      if (note.tag) {
        fmLines.push(`tag: ${note.tag}`);
      }
      if (note.tags) {
        fmLines.push(`tags: ${JSON.stringify(note.tags)}`);
      }
      writeFileSync(
        join(ws, 'content', filename),
        `---\n${fmLines.join('\n')}\n---\n${note.body}`
      );
    }
  }
}

function writeReachabilityWorkspace(ws: string): void {
  const folderChildren = REACHABILITY_CASES.filter(
    (entry) => entry.location === 'folder'
  ).map((entry) => ({
    data: entry.data,
    id: entry.nodeId,
    type: entry.nodeType,
  }));
  const nodes = REACHABILITY_CASES.filter(
    (entry) => entry.location !== 'folder'
  ).map((entry, index) => ({
    data:
      entry.nodeId === REACHABILITY_FOLDER_ID
        ? { ...entry.data, children: folderChildren }
        : entry.data,
    id: entry.nodeId,
    ...(entry.parentId ? { parentId: entry.parentId } : {}),
    position: { x: index * 10, y: index * 10 },
    type: entry.nodeType,
  }));
  const notes: Record<string, { body: string; id: string; title: string }> = {};
  for (const entry of REACHABILITY_CASES) {
    if (entry.content?.kind !== 'note') {
      continue;
    }
    const file = entry.data.file;
    if (typeof file !== 'string' || !file.startsWith('content/')) {
      continue;
    }
    notes[file.slice('content/'.length)] = {
      body: `Backing body for ${entry.id}.`,
      id: entry.content.id,
      title: `Backing ${entry.id}`,
    };
  }
  writeWorkspace(ws, {
    activeViewId: REACHABILITY_VIEW_ID,
    manifests: { [REACHABILITY_VIEW_ID]: { nodes } },
    notes,
    views: [
      {
        file: 'views/reachability.canvas.json',
        id: REACHABILITY_VIEW_ID,
        name: REACHABILITY_VIEW_NAME,
      },
    ],
  });

  mkdirSync(join(ws, '.ghostboard', 'widgets'), { recursive: true });
  writeFileSync(
    join(ws, '.ghostboard', 'widgets', `${REACHABILITY_WIDGET_ID}.json`),
    JSON.stringify({
      schema: 'ghostboard-widget/v1',
      id: REACHABILITY_WIDGET_ID,
      kind: 'checklist',
      title: REACHABILITY_WIDGET_MARKER,
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
      data: {
        items: [
          {
            checked: false,
            id: 'reachability-item',
            text: REACHABILITY_WIDGET_MARKER,
          },
        ],
      },
    })
  );

  mkdirSync(join(ws, '.ghostboard', 'extension-instances'), {
    recursive: true,
  });
  writeFileSync(
    join(
      ws,
      '.ghostboard',
      'extension-instances',
      `${REACHABILITY_EXTENSION_ID}.json`
    ),
    JSON.stringify({
      schema: 'ghostboard-extension-instance/v1',
      id: REACHABILITY_EXTENSION_ID,
      canvasTypeId: 'ghostboard.web/link',
      appVersion: '1.0.0',
      dataVersion: 1,
      revision: 1,
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
      state: { url: 'https://example.com/reachability' },
      presentation: {
        title: REACHABILITY_EXTENSION_MARKER,
        subtitle: 'Reachability extension',
        plainText: REACHABILITY_EXTENSION_MARKER,
      },
    })
  );
}

function writeUnlinkedReachabilityFiles(ws: string): void {
  for (const entry of UNLINKED_REACHABILITY_CASES) {
    const filePath = join(ws, entry.file);
    mkdirSync(dirname(filePath), { recursive: true });

    if (entry.type === 'markdown') {
      const frontmatter = entry.noteId
        ? `---\nid: ${entry.noteId}\ntitle: ${entry.title}\n---\n`
        : '';
      writeFileSync(filePath, `${frontmatter}Unlinked body ${entry.query}`);
      continue;
    }

    if (entry.type === 'sidecar') {
      writeFileSync(
        filePath,
        JSON.stringify({
          id: entry.noteId,
          schema: 'ghostboard-blocknote/v1',
          title: entry.title,
          text: entry.query,
        })
      );
      continue;
    }

    if (entry.type === 'widget') {
      writeFileSync(
        filePath,
        JSON.stringify({
          schema: 'ghostboard-widget/v1',
          id: entry.noteId,
          kind: 'checklist',
          title: entry.title,
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
          data: { items: [{ id: 'orphan-item', text: entry.query }] },
        })
      );
      continue;
    }

    writeFileSync(
      filePath,
      JSON.stringify({
        schema: 'ghostboard-extension-instance/v1',
        id: entry.noteId,
        canvasTypeId: 'ghostboard.web/link',
        appVersion: '1.0.0',
        dataVersion: 1,
        revision: 1,
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
        state: { url: `https://example.com/${entry.query}` },
        presentation: {
          title: entry.title,
          subtitle: entry.query,
          plainText: entry.query,
        },
      })
    );
  }
}

describe('search', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'search-test-'));
    renameMock.mockReset();
    renameMock.mockImplementation(async (from: string, to: string) => {
      const data = await readFile(from, 'utf8');
      await writeFile(to, data);
      rmSync(from, { force: true });
    });
    setBunFile();
  });

  it('returns empty array for empty query', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'Main', file: 'views/v1.canvas.json' }],
      manifests: { v1: { nodes: [] } },
    });
    const { searchWorkspace } = await import('./search');
    expect(await searchWorkspace(workspaceRoot, { query: '' })).toEqual([]);
    expect(await searchWorkspace(workspaceRoot, { query: '   ' })).toEqual([]);
  });

  it('matches view name (case-insensitive, prefix gets bonus)', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [
        { id: 'v1', name: 'Inbox Notes', file: 'views/v1.canvas.json' },
        { id: 'v2', name: 'Project Tasks', file: 'views/v2.canvas.json' },
      ],
      manifests: { v1: { nodes: [] }, v2: { nodes: [] } },
    });
    const { searchWorkspace } = await import('./search');
    const results = await searchWorkspace(workspaceRoot, { query: 'inbox' });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kind: 'view',
      viewId: 'v1',
      matchField: 'viewName',
      target: { type: 'view', viewId: 'v1' },
    });
  });

  it('matches asset metadata (title, fileName, mimeType) and link metadata (url, description, siteName)', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'V1', file: 'views/v1.canvas.json' }],
      manifests: {
        v1: {
          nodes: [
            {
              id: 'n-asset-pdf',
              type: 'asset',
              position: { x: 0, y: 0 },
              data: {
                title: 'Quarterly report',
                fileName: 'q3-financials.pdf',
                mimeType: 'application/pdf',
              },
            },
            {
              id: 'n-asset-img',
              type: 'asset',
              position: { x: 1, y: 1 },
              data: {
                title: 'Snapshot',
                fileName: 'snapshot.png',
                mimeType: 'image/png',
              },
            },
            {
              id: 'n-link',
              type: 'link',
              position: { x: 2, y: 2 },
              data: {
                title: 'Docs',
                url: 'https://example.com/docs',
                description: 'Reference manual entry point',
                siteName: 'Example Docs',
              },
            },
          ],
        },
      },
    });
    const { searchWorkspace } = await import('./search');

    const fileNameHits = await searchWorkspace(workspaceRoot, {
      query: 'q3-financials',
    });
    expect(
      fileNameHits.find(
        (r) => r.kind === 'asset' && r.matchField === 'fileName'
      )
    ).toBeDefined();

    const mimeHits = await searchWorkspace(workspaceRoot, {
      query: 'application/pdf',
    });
    expect(
      mimeHits.find((r) => r.kind === 'asset' && r.matchField === 'mimeType')
    ).toBeDefined();

    const urlHits = await searchWorkspace(workspaceRoot, {
      query: 'example.com/docs',
    });
    expect(
      urlHits.find((r) => r.kind === 'link' && r.matchField === 'url')
    ).toBeDefined();

    const descHits = await searchWorkspace(workspaceRoot, {
      query: 'reference manual',
    });
    expect(
      descHits.find((r) => r.kind === 'link' && r.matchField === 'description')
    ).toBeDefined();

    const siteHits = await searchWorkspace(workspaceRoot, {
      query: 'example docs',
    });
    expect(
      siteHits.find((r) => r.kind === 'link' && r.matchField === 'siteName')
    ).toBeDefined();
  });

  it('asset title scores higher than its mimeType / fileName matches', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'V1', file: 'views/v1.canvas.json' }],
      manifests: {
        v1: {
          nodes: [
            {
              id: 'asset-1',
              type: 'asset',
              position: { x: 0, y: 0 },
              data: {
                title: 'pdf overview',
                fileName: 'pdf-overview.pdf',
                mimeType: 'application/pdf',
              },
            },
          ],
        },
      },
    });
    const { searchWorkspace } = await import('./search');
    const results = await searchWorkspace(workspaceRoot, { query: 'pdf' });
    const titleHit = results.find((r) => r.matchField === 'title');
    const fileNameHit = results.find((r) => r.matchField === 'fileName');
    const mimeHit = results.find((r) => r.matchField === 'mimeType');
    expect(titleHit).toBeDefined();
    expect(fileNameHit).toBeDefined();
    expect(mimeHit).toBeDefined();
    expect(titleHit!.score).toBeGreaterThan(fileNameHit!.score);
    expect(fileNameHit!.score).toBeGreaterThan(mimeHit!.score);
  });

  it('matches recording metadata and default numbered titles', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'V1', file: 'views/v1.canvas.json' }],
      manifests: {
        v1: {
          nodes: [
            {
              id: 'recording-title',
              type: 'recording',
              position: { x: 0, y: 0 },
              data: {
                title: 'Design voice memo',
                fileName: 'voice-session.m4a',
                mimeType: 'audio/mp4',
                recordingNumber: 7,
              },
            },
            {
              id: 'recording-default',
              type: 'recording',
              position: { x: 1, y: 1 },
              data: {
                title: '',
                fileName: 'recording-8.m4a',
                mimeType: 'audio/webm',
                recordingNumber: 8,
              },
            },
          ],
        },
      },
    });
    const { searchWorkspace } = await import('./search');

    const titleHits = await searchWorkspace(workspaceRoot, {
      query: 'design voice',
    });
    expect(
      titleHits.find((r) => r.kind === 'recording' && r.matchField === 'title')
    ).toBeDefined();

    const fileNameHits = await searchWorkspace(workspaceRoot, {
      query: 'voice-session',
    });
    expect(
      fileNameHits.find(
        (r) => r.kind === 'recording' && r.matchField === 'fileName'
      )
    ).toBeDefined();

    const mimeHits = await searchWorkspace(workspaceRoot, {
      query: 'audio/webm',
    });
    expect(
      mimeHits.find(
        (r) => r.kind === 'recording' && r.matchField === 'mimeType'
      )
    ).toBeDefined();

    const defaultTitleHits = await searchWorkspace(workspaceRoot, {
      query: 'New Recording #8',
    });
    expect(
      defaultTitleHits.find(
        (r) =>
          r.kind === 'recording' &&
          r.nodeId === 'recording-default' &&
          r.matchField === 'title'
      )
    ).toBeDefined();
  });

  it('matches sticky content, folder title/subtitle, group label, edge label', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'V1', file: 'views/v1.canvas.json' }],
      manifests: {
        v1: {
          nodes: [
            {
              id: 'n-sticky',
              type: 'sticky',
              position: { x: 0, y: 0 },
              data: { content: 'Remember to BUY milk' },
            },
            {
              id: 'n-folder',
              type: 'folder',
              position: { x: 10, y: 10 },
              data: { title: 'Buy items', subtitle: 'weekly buy list' },
            },
            {
              id: 'n-group',
              type: 'group',
              position: { x: 20, y: 20 },
              data: { label: 'Buy Group' },
            },
            {
              id: 'n-image',
              type: 'image',
              position: { x: 30, y: 30 },
              data: { title: 'Buy receipt' },
            },
          ],
          edges: [
            {
              id: 'e1',
              source: 'n-sticky',
              target: 'n-folder',
              label: 'buy flow',
            },
            {
              id: 'e2',
              source: 'n-folder',
              target: 'n-group',
              data: { label: 'shop edge buy' },
            },
          ],
        },
      },
    });
    const { searchWorkspace } = await import('./search');
    const results = await searchWorkspace(workspaceRoot, { query: 'buy' });

    const fields = results.map((r) => `${r.kind}:${r.matchField}`);
    expect(fields).toEqual(
      expect.arrayContaining([
        'sticky:content',
        'folder:title',
        'folder:subtitle',
        'group:label',
        'image:title',
        'edge:label',
      ])
    );

    // Folder title (prefix match) outranks subtitle (mid-match)
    const titleResult = results.find((r) => r.matchField === 'title');
    const subtitleResult = results.find((r) => r.matchField === 'subtitle');
    expect(titleResult!.score).toBeGreaterThan(subtitleResult!.score);
    const edgeResult = results.find((r) => r.kind === 'edge');
    expect(edgeResult?.target).toEqual({
      type: 'edge',
      viewId: 'v1',
      edgeId: expect.any(String),
    });
  });

  it('returns explicit target placement for top-level, grouped, and detached nodes', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'V1', file: 'views/v1.canvas.json' }],
      manifests: {
        v1: {
          nodes: [
            {
              id: 'top-note',
              type: 'card',
              position: { x: 0, y: 0 },
              data: { noteId: 'note-top', title: 'Target top' },
            },
            {
              id: 'group-note',
              type: 'card',
              parentId: 'group-1',
              position: { x: 20, y: 20 },
              data: { noteId: 'note-group', title: 'Target group' },
            },
            {
              id: 'detached-note',
              type: 'card',
              position: { x: 40, y: 40 },
              data: {
                detached: true,
                noteId: 'note-detached',
                title: 'Target detached',
              },
            },
          ],
        },
      },
    });
    const { searchWorkspace } = await import('./search');
    const results = await searchWorkspace(workspaceRoot, { query: 'target' });

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'top-note',
          target: {
            type: 'node',
            viewId: 'v1',
            nodeId: 'top-note',
            placement: 'top-level',
            content: { kind: 'note', id: 'note-top' },
          },
        }),
        expect.objectContaining({
          nodeId: 'group-note',
          target: {
            type: 'node',
            viewId: 'v1',
            nodeId: 'group-note',
            placement: 'group',
            content: { kind: 'note', id: 'note-group' },
          },
        }),
        expect.objectContaining({
          nodeId: 'detached-note',
          target: {
            type: 'node',
            viewId: 'v1',
            nodeId: 'detached-note',
            placement: 'detached',
            content: { kind: 'note', id: 'note-detached' },
          },
        }),
      ])
    );
  });

  it('matches markdown body, joins to all nodes referencing the same noteId', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [
        { id: 'v1', name: 'V1', file: 'views/v1.canvas.json' },
        { id: 'v2', name: 'V2', file: 'views/v2.canvas.json' },
      ],
      manifests: {
        v1: {
          nodes: [
            {
              id: 'n1',
              type: 'card',
              position: { x: 0, y: 0 },
              data: { noteId: 'note-1', file: 'content/foo.md' },
            },
          ],
        },
        v2: {
          nodes: [
            {
              id: 'n2',
              type: 'card',
              position: { x: 5, y: 5 },
              data: { noteId: 'note-1', file: 'content/foo.md' },
            },
          ],
        },
      },
      notes: {
        'foo.md': {
          id: 'note-1',
          title: 'Cooking Notes',
          body: 'Today I learned to make ramen at home.',
        },
      },
    });
    const { searchWorkspace } = await import('./search');
    const results = await searchWorkspace(workspaceRoot, { query: 'ramen' });
    const bodyHits = results.filter((r) => r.matchField === 'body');
    expect(bodyHits).toHaveLength(2);
    expect(bodyHits.map((r) => r.viewId).sort()).toEqual(['v1', 'v2']);
    expect(bodyHits[0]?.excerpt).toContain('ramen');
    expect(bodyHits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: {
            type: 'node',
            viewId: 'v1',
            nodeId: 'n1',
            placement: 'top-level',
            content: { kind: 'note', id: 'note-1' },
          },
        }),
        expect.objectContaining({
          target: {
            type: 'node',
            viewId: 'v2',
            nodeId: 'n2',
            placement: 'top-level',
            content: { kind: 'note', id: 'note-1' },
          },
        }),
      ])
    );
  });

  it('matches Folder card children and keeps the owner container in the target', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'V1', file: 'views/v1.canvas.json' }],
      manifests: {
        v1: {
          nodes: [
            {
              id: 'folder-1',
              type: 'folder',
              position: { x: 0, y: 0 },
              data: {
                title: 'Reading list',
                children: [
                  {
                    id: 'folder-note-1',
                    type: 'card',
                    data: {
                      noteId: 'note-folder-1',
                      file: 'content/folder-note.md',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      notes: {
        'folder-note.md': {
          id: 'note-folder-1',
          title: 'Folder research',
          body: 'folder-only-search-marker',
        },
      },
    });
    const { searchWorkspace } = await import('./search');

    const results = await searchWorkspace(workspaceRoot, {
      query: 'folder-only-search-marker',
    });

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'note',
          nodeId: 'folder-note-1',
          noteId: 'note-folder-1',
          matchField: 'body',
          target: {
            type: 'folder-child',
            viewId: 'v1',
            folderId: 'folder-1',
            childId: 'folder-note-1',
            placement: 'folder',
            content: { kind: 'note', id: 'note-folder-1' },
          },
        }),
      ])
    );
  });

  it('matches BlockNote sidecar notes by title and flattened block text', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'V1', file: 'views/v1.canvas.json' }],
      manifests: {
        v1: {
          nodes: [
            {
              id: 'n1',
              type: 'card',
              position: { x: 0, y: 0 },
              data: { noteId: 'note_side' },
            },
          ],
        },
      },
    });
    // Write a JSON sidecar note with no backing `.md`.
    mkdirSync(join(workspaceRoot, 'content', '.ghostboard', 'blocknote'), {
      recursive: true,
    });
    writeFileSync(
      join(
        workspaceRoot,
        'content',
        '.ghostboard',
        'blocknote',
        'note_side.json'
      ),
      JSON.stringify({
        schema: 'ghostboard-blocknote/v1',
        noteId: 'note_side',
        revision: 1,
        title: 'Recipes',
        displayHint: 'note',
        blocks: [
          {
            type: 'paragraph',
            props: {},
            content: [
              {
                type: 'text',
                text: 'Today I made gyoza dumplings.',
                styles: {},
              },
            ],
            children: [],
          },
        ],
      })
    );

    const { searchWorkspace } = await import('./search');

    const bodyResults = await searchWorkspace(workspaceRoot, {
      query: 'gyoza',
    });
    const bodyHit = bodyResults.find((r) => r.matchField === 'body');
    expect(bodyHit?.noteId).toBe('note_side');
    expect(bodyHit?.excerpt).toContain('gyoza');

    const titleResults = await searchWorkspace(workspaceRoot, {
      query: 'recipes',
    });
    expect(
      titleResults.some(
        (r) => r.matchField === 'title' && r.noteId === 'note_side'
      )
    ).toBe(true);
  });

  it('cleans markdown noise (code blocks, link URLs) so they do not match', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'V1', file: 'views/v1.canvas.json' }],
      manifests: {
        v1: {
          nodes: [
            {
              id: 'n1',
              type: 'card',
              position: { x: 0, y: 0 },
              data: { noteId: 'note-1', file: 'content/foo.md' },
            },
          ],
        },
      },
      notes: {
        'foo.md': {
          id: 'note-1',
          title: 'Notes',
          body: '```\nsecret-keyword\n```\nSee [link](https://secret-keyword.example.com).',
        },
      },
    });
    const { searchWorkspace } = await import('./search');
    const results = await searchWorkspace(workspaceRoot, {
      query: 'secret-keyword',
    });
    expect(results).toHaveLength(0);
  });

  it('matches frontmatter tag and tags array', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'V1', file: 'views/v1.canvas.json' }],
      manifests: {
        v1: {
          nodes: [
            {
              id: 'n1',
              type: 'card',
              position: { x: 0, y: 0 },
              data: { noteId: 'note-1' },
            },
          ],
        },
      },
      notes: {
        'foo.md': {
          id: 'note-1',
          title: 'Trip',
          tags: ['Travel', 'Japan'],
          body: 'plain body',
        },
      },
    });
    const { searchWorkspace } = await import('./search');
    const results = await searchWorkspace(workspaceRoot, { query: 'japan' });
    const tagHit = results.find((r) => r.matchField === 'tag');
    expect(tagHit?.noteId).toBe('note-1');
  });

  it('matches sidecar notes by node-metadata tags', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'V1', file: 'views/v1.canvas.json' }],
      manifests: {
        v1: {
          nodes: [
            {
              id: 'n-side',
              type: 'card',
              position: { x: 0, y: 0 },
              data: { noteId: 'note_meta' },
            },
          ],
        },
      },
    });
    mkdirSync(join(workspaceRoot, 'content', '.ghostboard', 'blocknote'), {
      recursive: true,
    });
    writeFileSync(
      join(
        workspaceRoot,
        'content',
        '.ghostboard',
        'blocknote',
        'note_meta.json'
      ),
      JSON.stringify({
        schema: 'ghostboard-blocknote/v1',
        noteId: 'note_meta',
        revision: 1,
        title: 'Sidecar Trip',
        displayHint: 'note',
        blocks: [],
      })
    );
    writeFileSync(
      join(workspaceRoot, '.ghostboard', 'node-metadata.json'),
      JSON.stringify({
        schema: 'ghostboard-node-metadata/v1',
        entries: {
          note_meta: { tags: ['Travel', 'Japan'] },
        },
      })
    );

    const { searchWorkspace } = await import('./search');
    const results = await searchWorkspace(workspaceRoot, { query: 'japan' });
    const tagHit = results.find((r) => r.matchField === 'tag');
    expect(tagHit?.noteId).toBe('note_meta');
  });

  it('limits results and respects viewId scope', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [
        { id: 'v1', name: 'Alpha', file: 'views/v1.canvas.json' },
        { id: 'v2', name: 'Alpha2', file: 'views/v2.canvas.json' },
      ],
      manifests: { v1: { nodes: [] }, v2: { nodes: [] } },
    });
    const { searchWorkspace } = await import('./search');
    const all = await searchWorkspace(workspaceRoot, { query: 'alpha' });
    expect(all).toHaveLength(2);

    const scoped = await searchWorkspace(workspaceRoot, {
      query: 'alpha',
      viewId: 'v1',
    });
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.viewId).toBe('v1');

    const limited = await searchWorkspace(workspaceRoot, {
      query: 'alpha',
      limit: 1,
    });
    expect(limited).toHaveLength(1);
  });

  it('ignores notes that no manifest references', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'V1', file: 'views/v1.canvas.json' }],
      manifests: { v1: { nodes: [] } },
      notes: {
        'orphan.md': {
          id: 'note-orphan',
          title: 'Orphan',
          body: 'unique-marker',
        },
      },
    });
    const { searchWorkspace } = await import('./search');
    const results = await searchWorkspace(workspaceRoot, {
      query: 'unique-marker',
    });
    expect(results).toHaveLength(0);
  });

  it('does not read unreferenced note files during search', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'V1', file: 'views/v1.canvas.json' }],
      manifests: {
        v1: {
          nodes: [
            {
              id: 'n1',
              type: 'card',
              position: { x: 0, y: 0 },
              data: { noteId: 'note-1', file: 'content/referenced.md' },
            },
          ],
        },
      },
      notes: {
        'referenced.md': {
          id: 'note-1',
          title: 'Referenced',
          body: 'matchable body',
        },
        'orphan.md': {
          id: 'note-orphan',
          title: 'Orphan',
          body: 'unique-marker',
        },
      },
    });
    const { searchWorkspace } = await import('./search');

    await searchWorkspace(workspaceRoot, { query: 'matchable' });

    const fileCalls = vi
      .mocked(Bun.file)
      .mock.calls.map(([filePath]) => String(filePath));
    expect(fileCalls.some((filePath) => filePath.endsWith('orphan.md'))).toBe(
      false
    );
  });

  it('matches referenced widget records and skips corrupted widget files', async () => {
    writeWorkspace(workspaceRoot, {
      activeViewId: 'v1',
      views: [{ id: 'v1', name: 'V1', file: 'views/v1.canvas.json' }],
      manifests: {
        v1: {
          nodes: [
            {
              id: 'widget-check',
              type: 'widget',
              position: { x: 0, y: 0 },
              data: { widgetId: 'widget_check', kind: 'checklist' },
            },
            {
              id: 'folder-1',
              type: 'folder',
              position: { x: 10, y: 10 },
              data: {
                title: 'Folder',
                children: [
                  {
                    id: 'widget-reminder-child',
                    type: 'widget',
                    data: { widgetId: 'widget_reminder', kind: 'reminder' },
                  },
                ],
              },
            },
            {
              id: 'widget-pomodoro',
              type: 'widget',
              position: { x: 20, y: 20 },
              data: { widgetId: 'widget_pomodoro', kind: 'pomodoro' },
            },
            {
              id: 'widget-broken',
              type: 'widget',
              position: { x: 30, y: 30 },
              data: { widgetId: 'widget_broken', kind: 'checklist' },
            },
          ],
        },
      },
    });
    mkdirSync(join(workspaceRoot, '.ghostboard', 'widgets'), {
      recursive: true,
    });
    writeFileSync(
      join(workspaceRoot, '.ghostboard', 'widgets', 'widget_check.json'),
      JSON.stringify({
        schema: 'ghostboard-widget/v1',
        id: 'widget_check',
        kind: 'checklist',
        title: 'Launch Checklist',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
        data: {
          items: [
            { id: 'item_1', text: 'Resolve launch blocker', checked: false },
          ],
        },
      })
    );
    writeFileSync(
      join(workspaceRoot, '.ghostboard', 'widgets', 'widget_reminder.json'),
      JSON.stringify({
        schema: 'ghostboard-widget/v1',
        id: 'widget_reminder',
        kind: 'reminder',
        title: 'Invoice reminder',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
        data: {
          dueAt: '2026-07-09T09:30:00.000Z',
          timezone: 'Asia/Singapore',
          status: 'scheduled',
          note: 'Send the renewal invoice',
        },
      })
    );
    writeFileSync(
      join(workspaceRoot, '.ghostboard', 'widgets', 'widget_pomodoro.json'),
      JSON.stringify({
        schema: 'ghostboard-widget/v1',
        id: 'widget_pomodoro',
        kind: 'pomodoro',
        title: 'Deep focus timer',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
        data: {
          mode: 'focus',
          focusMinutes: 25,
          shortBreakMinutes: 5,
          longBreakMinutes: 15,
          sessionsBeforeLongBreak: 4,
          completedSessions: 0,
          timer: { state: 'idle' },
        },
      })
    );
    writeFileSync(
      join(workspaceRoot, '.ghostboard', 'widgets', 'widget_broken.json'),
      '{not json'
    );

    const { searchWorkspace } = await import('./search');

    const checklistHits = await searchWorkspace(workspaceRoot, {
      query: 'launch blocker',
    });
    expect(checklistHits[0]).toMatchObject({
      kind: 'widget',
      widgetId: 'widget_check',
      widgetKind: 'checklist',
      nodeId: 'widget-check',
      excerpt: 'Resolve launch blocker',
    });

    const reminderHits = await searchWorkspace(workspaceRoot, {
      query: 'renewal invoice',
    });
    expect(reminderHits[0]).toMatchObject({
      kind: 'widget',
      widgetId: 'widget_reminder',
      widgetKind: 'reminder',
      nodeId: 'widget-reminder-child',
      target: {
        type: 'folder-child',
        viewId: 'v1',
        folderId: 'folder-1',
        childId: 'widget-reminder-child',
        placement: 'folder',
        content: { kind: 'widget', id: 'widget_reminder' },
      },
    });

    const dueHits = await searchWorkspace(workspaceRoot, {
      query: '2026-07-09',
    });
    expect(dueHits[0]).toMatchObject({
      kind: 'widget',
      widgetId: 'widget_reminder',
      widgetKind: 'reminder',
    });

    const pomodoroHits = await searchWorkspace(workspaceRoot, {
      query: 'deep focus',
    });
    expect(pomodoroHits[0]).toMatchObject({
      kind: 'widget',
      widgetId: 'widget_pomodoro',
      widgetKind: 'pomodoro',
    });
  });

  it('covers every backend-searchable position/type in the D1-4 matrix', async () => {
    writeReachabilityWorkspace(workspaceRoot);
    writeUnlinkedReachabilityFiles(workspaceRoot);
    const { searchWorkspace } = await import('./search');

    for (const entry of REACHABILITY_CASES) {
      const results = await searchWorkspace(workspaceRoot, {
        query: entry.query,
      });
      const match = results.find((result) => result.nodeId === entry.nodeId);

      if (!entry.backend) {
        expect(match, entry.id).toBeUndefined();
        continue;
      }

      expect(match, entry.id).toBeDefined();
      expect(match?.target, entry.id).toEqual(targetForReachabilityCase(entry));
      if (entry.expectedKind) {
        expect(match?.kind, entry.id).toBe(entry.expectedKind);
      }
    }

    expect(
      REACHABILITY_CASES.filter(
        (entry) => entry.parentId === REACHABILITY_GROUP_ID
      )
    ).not.toHaveLength(0);

    for (const entry of UNLINKED_REACHABILITY_CASES) {
      const results = await searchWorkspace(workspaceRoot, {
        query: entry.query,
      });
      expect(results, entry.id).toHaveLength(0);
    }
  });

  it('cleanMarkdown strips fences, links, headings, bold/italic, lists', async () => {
    const { cleanMarkdown } = await import('./search');
    expect(cleanMarkdown('# Heading\n**bold** and _x_')).toBe(
      'Heading bold and _x_'
    );
    expect(cleanMarkdown('See [docs](https://example.com).')).toBe('See docs.');
    expect(cleanMarkdown('```\ncode\n```\nafter')).toBe('after');
    expect(cleanMarkdown('- [x] done\n- [ ] todo')).toBe('done todo');
    // Underscores inside identifiers are preserved
    expect(cleanMarkdown('foo_bar baz')).toBe('foo_bar baz');
  });
});
