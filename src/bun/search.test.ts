import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
