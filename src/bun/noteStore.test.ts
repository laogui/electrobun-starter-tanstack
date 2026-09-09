import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
}));

const setBunFile = () => {
  const fs = require('node:fs') as typeof import('node:fs');
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => ({
      exists: async () => fs.existsSync(filePath),
      text: async () => fs.readFileSync(filePath, 'utf8'),
      json: async () => JSON.parse(fs.readFileSync(filePath, 'utf8')),
    })),
    write: vi.fn(async (filePath: string, data: string) => {
      await writeFile(filePath, data);
    }),
  });
};

const sidecarDir = (ws: string) =>
  join(ws, 'content', '.ghostboard', 'blocknote');

function writeSidecar(
  ws: string,
  noteId: string,
  sidecar: Record<string, unknown>
) {
  mkdirSync(sidecarDir(ws), { recursive: true });
  writeFileSync(
    join(sidecarDir(ws), `${noteId}.json`),
    JSON.stringify({ schema: 'ghostboard-blocknote/v1', noteId, ...sidecar })
  );
}

function writeMarkdown(ws: string, file: string, content: string) {
  mkdirSync(join(ws, 'content'), { recursive: true });
  writeFileSync(join(ws, 'content', file), content);
}

const paragraph = (text: string) => ({
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text, styles: {} }],
  children: [],
});

describe('noteStore', () => {
  let ws: string;

  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), 'notestore-test-'));
    setBunFile();
    mkdirSync(join(ws, 'content'), { recursive: true });
  });

  describe('buildNoteIndex', () => {
    it('indexes sidecars and legacy markdown, merging dual-backed notes', async () => {
      const { buildNoteIndex } = await import('./noteStore');
      writeSidecar(ws, 'note_sidecar', { revision: 3, blocks: [] });
      writeSidecar(ws, 'note_dual', { revision: 1, blocks: [] });
      writeMarkdown(
        ws,
        'dual.md',
        '---\nid: note_dual\ntitle: Dual\n---\nbody'
      );
      writeMarkdown(ws, 'legacy.md', '---\nid: note_md\ntitle: MD\n---\nbody');
      writeMarkdown(ws, 'no-id.md', '---\ntitle: NoId\n---\nbody');

      const index = await buildNoteIndex(ws);

      expect(index.get('note_sidecar')).toEqual({
        noteId: 'note_sidecar',
        hasSidecar: true,
      });
      expect(index.get('note_dual')).toEqual({
        noteId: 'note_dual',
        hasSidecar: true,
        markdownFile: 'content/dual.md',
      });
      expect(index.get('note_md')).toEqual({
        noteId: 'note_md',
        hasSidecar: false,
        markdownFile: 'content/legacy.md',
      });
      // Markdown without a frontmatter id is not indexed.
      expect([...index.keys()]).not.toContain('');
      expect(index.size).toBe(3);
    });
  });

  describe('loadNoteRecord', () => {
    it('prefers the sidecar and exposes its metadata + preview', async () => {
      const { loadNoteRecord } = await import('./noteStore');
      writeSidecar(ws, 'note_a', {
        revision: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-02T00:00:00.000Z',
        title: 'Alpha',
        displayHint: 'note',
        color: '#fca5a5',
        preview: {
          html: '<p>Alpha</p>',
          excerpt: 'Alpha',
          blocks: 1,
          version: 1,
        },
        blocks: [paragraph('Alpha')],
      });

      const record = await loadNoteRecord(ws, 'note_a', 'content/a.md');
      expect(record).toMatchObject({
        noteId: 'note_a',
        source: 'sidecar',
        title: 'Alpha',
        color: '#fca5a5',
        revision: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
        corrupted: false,
      });
      expect(record?.preview?.html).toBe('<p>Alpha</p>');
      expect(Array.isArray(record?.blocks)).toBe(true);
    });

    it('falls back to legacy markdown when no sidecar exists', async () => {
      const { loadNoteRecord } = await import('./noteStore');
      writeMarkdown(
        ws,
        'b.md',
        '---\nid: note_b\ntitle: Bravo\ncolor: "#fff"\npreviewHtml: "<p>hi</p>"\n---\nbravo body'
      );

      const record = await loadNoteRecord(ws, 'note_b', 'content/b.md');
      expect(record).toMatchObject({
        noteId: 'note_b',
        source: 'markdown',
        title: 'Bravo',
        blocks: null,
      });
      expect(record?.markdownDoc?.body).toBe('bravo body');
      expect(record?.preview?.html).toBe('<p>hi</p>');
    });

    it('returns null when neither sidecar nor markdown exist', async () => {
      const { loadNoteRecord } = await import('./noteStore');
      const record = await loadNoteRecord(ws, 'note_missing');
      expect(record).toBeNull();
    });

    it('falls back to markdown when the sidecar is corrupted', async () => {
      const { loadNoteRecord } = await import('./noteStore');
      mkdirSync(sidecarDir(ws), { recursive: true });
      writeFileSync(join(sidecarDir(ws), 'note_c.json'), '{ not valid json');
      writeMarkdown(ws, 'c.md', '---\nid: note_c\ntitle: Charlie\n---\nbody');

      const record = await loadNoteRecord(ws, 'note_c', 'content/c.md');
      expect(record?.source).toBe('markdown');
      expect(record?.title).toBe('Charlie');
    });
  });

  describe('noteRecordToCardData', () => {
    it('projects a sidecar record into card data with preview fields', async () => {
      const { loadNoteRecord, noteRecordToCardData } = await import(
        './noteStore'
      );
      writeSidecar(ws, 'note_d', {
        revision: 1,
        title: 'Delta',
        displayHint: 'note',
        color: '#abc',
        preview: { html: '<p>D</p>', excerpt: 'D', blocks: 1, version: 1 },
        blocks: [paragraph('D')],
      });
      const record = await loadNoteRecord(ws, 'note_d');
      const data = noteRecordToCardData(record!);
      expect(data).toMatchObject({
        type: 'text',
        title: 'Delta',
        color: '#abc',
        editor: 'blocknote',
        previewHtml: '<p>D</p>',
        previewExcerpt: 'D',
      });
      expect(data).not.toHaveProperty('content');
    });

    it('projects a legacy markdown record using noteToCardData', async () => {
      const { loadNoteRecord, noteRecordToCardData } = await import(
        './noteStore'
      );
      writeMarkdown(ws, 'e.md', '---\nid: note_e\ntitle: Echo\n---\nthe body');
      const record = await loadNoteRecord(ws, 'note_e', 'content/e.md');
      const data = noteRecordToCardData(record!);
      expect(data.title).toBe('Echo');
      expect(data.content).toBe('the body');
    });
  });

  describe('mergeNoteMeta', () => {
    it('updates title/color with a fresh revision while preserving blocks and preview', async () => {
      const { mergeNoteMeta } = await import('./noteStore');
      writeSidecar(ws, 'note_f', {
        revision: 7,
        title: 'Old',
        color: '#000',
        displayHint: 'note',
        preview: {
          html: '<p>keep</p>',
          excerpt: 'keep',
          blocks: 1,
          version: 1,
        },
        blocks: [paragraph('keep')],
      });

      const wrote = await mergeNoteMeta(ws, 'note_f', {
        expectedRevision: 7,
        title: 'New',
        color: '#fff',
      });
      expect(wrote).toBe(true);

      const saved = JSON.parse(
        readFileSync(join(sidecarDir(ws), 'note_f.json'), 'utf8')
      ) as {
        title: string;
        color: string;
        revision: number;
        preview: { html: string };
        blocks: unknown[];
      };
      expect(saved.title).toBe('New');
      expect(saved.color).toBe('#fff');
      expect(saved.revision).toBe(8);
      expect(saved.preview.html).toBe('<p>keep</p>'); // preserved
      expect(saved.blocks).toHaveLength(1); // preserved
    });

    it('applyNoteTitle writes title and bumps revision without touching blocks', async () => {
      const { applyNoteTitle, loadNoteRecord } = await import('./noteStore');
      writeSidecar(ws, 'note_title_batch', {
        revision: 4,
        title: '  Hello   world ',
        displayHint: 'note',
        preview: {
          html: '<p>keep</p>',
          excerpt: 'keep',
          blocks: 1,
          version: 1,
        },
        blocks: [paragraph('keep')],
      });
      await applyNoteTitle(ws, 'note_title_batch', {
        title: 'Hello world',
        revision: 5,
      });
      const record = await loadNoteRecord(ws, 'note_title_batch');
      expect(record).toMatchObject({
        title: 'Hello world',
        revision: 5,
        source: 'sidecar',
      });
      expect(record?.preview?.html).toBe('<p>keep</p>');
      expect(record?.blocks).toHaveLength(1);
    });

    it('does not write when metadata is unchanged', async () => {
      const { mergeNoteMeta } = await import('./noteStore');
      writeSidecar(ws, 'note_g', {
        revision: 1,
        title: 'Same',
        color: '#111',
        blocks: [],
      });
      const wrote = await mergeNoteMeta(ws, 'note_g', {
        title: 'Same',
        color: '#111',
      });
      expect(wrote).toBe(false);
    });

    it('returns false when there is no sidecar', async () => {
      const { mergeNoteMeta } = await import('./noteStore');
      const wrote = await mergeNoteMeta(ws, 'note_none', { title: 'x' });
      expect(wrote).toBe(false);
    });
  });

  describe('invalid note ids', () => {
    it('loadNoteRecord falls back to markdown for an invalid sidecar id (no throw)', async () => {
      const { loadNoteRecord } = await import('./noteStore');
      writeMarkdown(
        ws,
        'spacey.md',
        '---\nid: my note\ntitle: Spacey\n---\nbody'
      );
      const record = await loadNoteRecord(ws, 'my note', 'content/spacey.md');
      expect(record?.source).toBe('markdown');
      expect(record?.title).toBe('Spacey');
    });

    it('listNoteRecords tolerates a legacy note with an invalid id', async () => {
      const { listNoteRecords } = await import('./noteStore');
      writeSidecar(ws, 'note_ok', { revision: 1, title: 'OK', blocks: [] });
      writeMarkdown(
        ws,
        'slashy.md',
        '---\nid: bad/id\ntitle: Slashy\n---\nbody'
      );

      const records = await listNoteRecords(ws); // must not throw
      const ids = records.map((r) => r.noteId);
      expect(ids).toContain('note_ok');
      expect(ids).toContain('bad/id');
    });
  });
});
