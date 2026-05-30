import { basename } from 'node:path';

import { blocksToMarkdown } from './blocknoteMarkdown';
import type { NoteRecord } from './noteStore';

/**
 * Markdown export — turns note records (BlockNote sidecar blocks or legacy
 * markdown) into portable `.md` files. This module holds the pure, testable
 * core (building markdown text + the export index). File IO and the native
 * save dialog live in the RPC layer (`index.ts`).
 */

const PASSTHROUGH_URL_RE = /^(?:https?:|data:|blob:|file:|mailto:)/i;
const LEADING_DOT_SLASH_RE = /^\.\//;
const MD_ATTACHMENT_LINK_RE = /\]\((attachments\/[^)\s]+)\)/g;
const SLUG_STRIP_RE = /[^a-z\d]+/g;
const SLUG_TRIM_RE = /^-|-$/g;
const YAML_UNSAFE_RE = /[:#"\n]/;

export interface ExportedNote {
  attachments: string[]; // workspace-relative attachment paths referenced
  fileName: string; // e.g. 'my-note-a1b2c3d4.md'
  markdown: string;
  noteId: string;
  title: string;
}

export interface BuildNoteMarkdownOptions {
  /** Prefix applied to rewritten attachment links (default `attachments/`). */
  attachmentLinkPrefix?: string;
  /** ISO timestamp recorded in the YAML frontmatter `exportedAt`. */
  exportedAt?: string;
  /** Whether to prepend YAML frontmatter (default true). */
  includeFrontmatter?: boolean;
}

const makeAttachmentResolver =
  (prefix: string, collected: Set<string>) =>
  (url: string): string => {
    if (!url || PASSTHROUGH_URL_RE.test(url)) {
      return url;
    }
    const normalized = url.replace(LEADING_DOT_SLASH_RE, '');
    collected.add(normalized);
    return `${prefix}${basename(normalized)}`;
  };

const rewriteMarkdownAttachments = (
  body: string,
  prefix: string,
  collected: Set<string>
): string =>
  body.replaceAll(MD_ATTACHMENT_LINK_RE, (_match, path: string) => {
    collected.add(path);
    return `](${prefix}${basename(path)})`;
  });

// Only the user-controlled title needs quoting; noteId is `[A-Za-z0-9_-]+`
// and timestamps are ISO-8601 tokens that are safe unquoted in YAML.
const yamlValue = (value: string): string =>
  YAML_UNSAFE_RE.test(value)
    ? `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`
    : value;

const buildFrontmatter = (record: NoteRecord, exportedAt: string): string => {
  const lines = ['---', `id: ${record.noteId}`];
  if (record.title) {
    lines.push(`title: ${yamlValue(record.title)}`);
  }
  lines.push('source: ghostboard');
  if (record.createdAt) {
    lines.push(`createdAt: ${record.createdAt}`);
  }
  if (record.updatedAt) {
    lines.push(`updatedAt: ${record.updatedAt}`);
  }
  lines.push(`exportedAt: ${exportedAt}`);
  lines.push('---');
  return lines.join('\n');
};

/** Build a filesystem-safe export filename for a note. */
export function exportFileName(record: NoteRecord): string {
  const slug =
    record.title
      .toLowerCase()
      .replaceAll(SLUG_STRIP_RE, '-')
      .replaceAll(SLUG_TRIM_RE, '')
      .slice(0, 50) || 'untitled';
  const suffix = record.noteId.slice(-8);
  return `${slug}-${suffix}.md`;
}

/**
 * Build the Markdown text for a single note plus the set of workspace
 * attachments it references (so the caller can copy them alongside the file).
 */
export function buildNoteMarkdown(
  record: NoteRecord,
  options: BuildNoteMarkdownOptions = {}
): ExportedNote {
  const prefix = options.attachmentLinkPrefix ?? 'attachments/';
  const includeFrontmatter = options.includeFrontmatter !== false;
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const collected = new Set<string>();

  let body: string;
  if (Array.isArray(record.blocks) && record.blocks.length > 0) {
    body = blocksToMarkdown(record.blocks, {
      resolveAttachmentUrl: makeAttachmentResolver(prefix, collected),
    });
  } else if (record.markdownDoc) {
    body = rewriteMarkdownAttachments(
      record.markdownDoc.body,
      prefix,
      collected
    );
  } else {
    body = '';
  }

  const frontmatter = includeFrontmatter
    ? buildFrontmatter(record, exportedAt)
    : '';
  const markdown = frontmatter ? `${frontmatter}\n\n${body}\n` : `${body}\n`;

  return {
    noteId: record.noteId,
    title: record.title,
    fileName: exportFileName(record),
    markdown,
    attachments: [...collected],
  };
}

export interface ExportIndexOptions {
  exportedAt: string;
  failures?: Array<{ noteId: string; reason: string }>;
  notes: ExportedNote[];
  source?: string;
}

/** Build the `index.md` manifest written at the root of a batch export. */
export function buildIndexMarkdown(options: ExportIndexOptions): string {
  const lines = ['# GhostBoard Markdown Export', ''];
  if (options.source) {
    lines.push(`- Source: ${options.source}`);
  }
  lines.push(`- Exported at: ${options.exportedAt}`);
  lines.push(`- Documents: ${options.notes.length}`);
  if (options.failures && options.failures.length > 0) {
    lines.push(`- Failed: ${options.failures.length}`);
  }
  lines.push('', '## Documents', '');
  if (options.notes.length === 0) {
    lines.push('_No notes exported._');
  } else {
    for (const note of options.notes) {
      const label = note.title || note.noteId;
      lines.push(`- [${label}](notes/${note.fileName})`);
    }
  }
  if (options.failures && options.failures.length > 0) {
    lines.push('', '## Failures', '');
    for (const failure of options.failures) {
      lines.push(`- ${failure.noteId}: ${failure.reason}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
