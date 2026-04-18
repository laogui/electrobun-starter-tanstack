// biome-ignore-all lint/security/noDangerouslySetInnerHtml: NotePreview renders previewHtml after DOMPurify sanitization.
import DOMPurify from 'dompurify';
import { memo, useMemo } from 'react';

import { cn } from '@/lib/utils';
import { buildPreview } from '../../../shared/markdown/preview';
import { markdownSanitizeConfig } from '../../../shared/markdown/sanitize';

interface NotePreviewProps {
  className?: string;
  excerpt?: unknown;
  fallback?: unknown;
  html?: unknown;
}

const toText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const sanitizePreviewHtml = (html: string): string =>
  DOMPurify.sanitize(html, markdownSanitizeConfig) as string;

export const NotePreview = memo(
  ({ className, excerpt, fallback, html }: NotePreviewProps) => {
    const rawHtml = toText(html);
    const fallbackMarkdown = toText(fallback);
    const previewHtml = useMemo(
      () =>
        rawHtml
          ? sanitizePreviewHtml(rawHtml)
          : buildPreview(fallbackMarkdown, {
              sanitizeHtml: sanitizePreviewHtml,
            }).html,
      [fallbackMarkdown, rawHtml]
    );
    const fallbackText = toText(excerpt) || fallbackMarkdown || 'Empty note';

    if (!previewHtml) {
      return (
        <div
          className={cn(
            'flex-1 overflow-hidden whitespace-pre-wrap text-sm/relaxed',
            fallbackText === 'Empty note' && 'opacity-40',
            className
          )}
        >
          {fallbackText}
        </div>
      );
    }

    return (
      <div
        className={cn(
          'note-preview prose prose-neutral prose-sm max-w-none flex-1 overflow-hidden',
          className
        )}
        dangerouslySetInnerHTML={{ __html: previewHtml }}
      />
    );
  }
);

NotePreview.displayName = 'NotePreview';
