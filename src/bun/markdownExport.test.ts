import { describe, expect, it } from 'vitest';

import {
  buildIndexMarkdown,
  buildNoteMarkdown,
  exportFileName,
} from './markdownExport';
import type { NoteRecord } from './noteStore';

const sidecarRecord = (overrides: Partial<NoteRecord> = {}): NoteRecord => ({
  noteId: 'note_abcd1234',
  source: 'sidecar',
  title: 'My Note',
  displayHint: 'note',
  color: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-02T00:00:00.000Z',
  revision: 1,
  blocks: [
    {
      type: 'heading',
      props: { level: 1 },
      content: [{ type: 'text', text: 'Title', styles: {} }],
      children: [],
    },
    {
      type: 'paragraph',
      props: {},
      content: [{ type: 'text', text: 'hello world', styles: {} }],
      children: [],
    },
  ],
  preview: null,
  corrupted: false,
  ...overrides,
});

describe('markdownExport', () => {
  describe('exportFileName', () => {
    it('slugifies the title and appends the noteId suffix', () => {
      expect(exportFileName(sidecarRecord())).toBe('my-note-abcd1234.md');
    });

    it('falls back to "untitled" for an empty title', () => {
      expect(exportFileName(sidecarRecord({ title: '' }))).toBe(
        'untitled-abcd1234.md'
      );
    });
  });

  describe('buildNoteMarkdown', () => {
    it('emits YAML frontmatter plus the serialized blocks', () => {
      const result = buildNoteMarkdown(sidecarRecord(), {
        exportedAt: '2026-03-03T00:00:00.000Z',
      });
      expect(result.markdown).toContain('---');
      expect(result.markdown).toContain('id: note_abcd1234');
      expect(result.markdown).toContain('title: My Note');
      expect(result.markdown).toContain('source: ghostboard');
      expect(result.markdown).toContain('exportedAt: 2026-03-03T00:00:00.000Z');
      expect(result.markdown).toContain('# Title');
      expect(result.markdown).toContain('hello world');
      expect(result.attachments).toEqual([]);
    });

    it('quotes YAML titles with flow collection and anchor characters', () => {
      const result = buildNoteMarkdown(
        sidecarRecord({ title: 'Plan [v2] & owners @ friday' }),
        {
          exportedAt: '2026-03-03T00:00:00.000Z',
        }
      );

      expect(result.markdown).toContain('title: "Plan [v2] & owners @ friday"');
    });

    it('omits frontmatter when includeFrontmatter is false', () => {
      const result = buildNoteMarkdown(sidecarRecord(), {
        includeFrontmatter: false,
      });
      expect(result.markdown.startsWith('---')).toBe(false);
      expect(result.markdown).toContain('# Title');
    });

    it('rewrites and collects attachment links from blocks', () => {
      const record = sidecarRecord({
        blocks: [
          {
            type: 'image',
            props: { url: 'attachments/img_1234.png', caption: 'Pic' },
            content: undefined,
            children: [],
          },
        ],
      });
      const result = buildNoteMarkdown(record, {
        exportedAt: '2026-03-03T00:00:00.000Z',
      });
      expect(result.markdown).toContain('![Pic](attachments/img_1234.png)');
      expect(result.attachments).toEqual(['attachments/img_1234.png']);
    });

    it('honours a custom attachment link prefix (batch layout)', () => {
      const record = sidecarRecord({
        blocks: [
          {
            type: 'image',
            props: { url: 'attachments/img_1234.png' },
            content: undefined,
            children: [],
          },
        ],
      });
      const result = buildNoteMarkdown(record, {
        attachmentLinkPrefix: '../attachments/',
      });
      expect(result.markdown).toContain('../attachments/img_1234.png');
      expect(result.attachments).toEqual(['attachments/img_1234.png']);
    });

    it('exports legacy markdown bodies and rewrites their attachment links', () => {
      const record: NoteRecord = {
        noteId: 'note_legacy12',
        source: 'markdown',
        title: 'Legacy',
        displayHint: 'note',
        color: '',
        revision: 0,
        blocks: null,
        preview: null,
        corrupted: false,
        markdownDoc: {
          file: 'content/legacy.md',
          frontmatter: { id: 'note_legacy12', title: 'Legacy' },
          body: '# Legacy\n\n![pic](attachments/old_5678.png)',
        },
      };
      const result = buildNoteMarkdown(record, {
        attachmentLinkPrefix: '../attachments/',
        exportedAt: '2026-03-03T00:00:00.000Z',
      });
      expect(result.markdown).toContain('# Legacy');
      expect(result.markdown).toContain('![pic](../attachments/old_5678.png)');
      expect(result.attachments).toEqual(['attachments/old_5678.png']);
    });

    it('leaves external (http/data) urls untouched', () => {
      const record = sidecarRecord({
        blocks: [
          {
            type: 'image',
            props: { url: 'https://example.com/x.png' },
            content: undefined,
            children: [],
          },
        ],
      });
      const result = buildNoteMarkdown(record);
      expect(result.markdown).toContain('https://example.com/x.png');
      expect(result.attachments).toEqual([]);
    });
  });

  describe('buildIndexMarkdown', () => {
    it('lists exported documents and failures', () => {
      const notes = [
        buildNoteMarkdown(sidecarRecord({ title: 'Alpha', noteId: 'note_a1' })),
        buildNoteMarkdown(sidecarRecord({ title: 'Beta', noteId: 'note_b2' })),
      ];
      const index = buildIndexMarkdown({
        notes,
        exportedAt: '2026-03-03T00:00:00.000Z',
        source: 'All notes',
        failures: [{ noteId: 'note_bad', reason: 'corrupted sidecar' }],
      });
      expect(index).toContain('# GhostBoard Markdown Export');
      expect(index).toContain('- Source: All notes');
      expect(index).toContain('- Documents: 2');
      expect(index).toContain('- Failed: 1');
      expect(index).toContain('[Alpha](notes/alpha-note_a1.md)');
      expect(index).toContain('[Beta](notes/beta-note_b2.md)');
      expect(index).toContain('## Failures');
      expect(index).toContain('note_bad: corrupted sidecar');
    });

    it('handles an empty export', () => {
      const index = buildIndexMarkdown({
        notes: [],
        exportedAt: '2026-03-03T00:00:00.000Z',
      });
      expect(index).toContain('- Documents: 0');
      expect(index).toContain('_No notes exported._');
    });
  });
});
