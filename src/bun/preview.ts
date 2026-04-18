import sanitizeHtml from 'sanitize-html';

import {
  buildPreview,
  type PreviewArtifacts,
} from '../shared/markdown/preview';
import {
  markdownAllowedAttributes,
  markdownAllowedTags,
} from '../shared/markdown/sanitize';
import { saveNote } from './notes';

const sanitizeMarkdownHtml = (dirtyHtml: string): string =>
  sanitizeHtml(dirtyHtml, {
    allowedAttributes: {
      '*': [...markdownAllowedAttributes],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedTags: [...markdownAllowedTags],
  });

export async function writeNoteWithPreview(
  wsPath: string,
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string
): Promise<PreviewArtifacts> {
  const preview = buildPreview(body, { sanitizeHtml: sanitizeMarkdownHtml });
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

export { buildPreview };
export type { PreviewArtifacts };
