import sanitizeHtml from 'sanitize-html';

import {
  buildPreview,
  type PreviewArtifacts,
} from '../shared/markdown/preview';
import {
  markdownAllowedAttributes,
  markdownAllowedTags,
} from '../shared/markdown/sanitize';
import { buildBlockNotePreview } from './blocknotePreview';
import { saveNote } from './notes';

const sanitizeMarkdownHtml = (dirtyHtml: string): string =>
  sanitizeHtml(dirtyHtml, {
    allowedAttributes: {
      '*': [...markdownAllowedAttributes],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedTags: [...markdownAllowedTags],
  });

/**
 * Write a note file and refresh its card preview metadata.
 *
 * When `blocks` is provided (BlockNote save path) the preview is derived from
 * the structured blocks — faithful to the editor, no Markdown lossiness. When
 * omitted (legacy markdown / checklist path) the preview falls back to parsing
 * the Markdown `body`. See `docs/features/Review/preview-from-blocknote-json.md`.
 */
export async function writeNoteWithPreview(
  wsPath: string,
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string,
  blocks?: unknown[]
): Promise<PreviewArtifacts> {
  const preview =
    blocks === undefined
      ? buildPreview(body, { sanitizeHtml: sanitizeMarkdownHtml })
      : buildBlockNotePreview(blocks, { sanitizeHtml: sanitizeMarkdownHtml });
  await saveNote(
    wsPath,
    filePath,
    {
      ...frontmatter,
      previewHtml: preview.html,
      previewExcerpt: preview.excerpt,
      previewBlocks: preview.blocks,
      previewVersion: preview.version,
    },
    body
  );
  return preview;
}

/**
 * Build a sanitized card preview directly from BlockNote blocks. Used by the
 * sidecar save path so the cached `preview` is faithful to the editor model.
 */
export function buildNotePreviewFromBlocks(
  blocks: unknown[]
): PreviewArtifacts {
  return buildBlockNotePreview(blocks, { sanitizeHtml: sanitizeMarkdownHtml });
}

export { buildPreview };
export type { PreviewArtifacts };
