// biome-ignore-all lint/security/noDangerouslySetInnerHtml: NotePreview renders previewHtml after DOMPurify sanitization.
import DOMPurify from 'dompurify';
import { memo, useEffect, useMemo, useState } from 'react';

import { rpcLoadAttachment } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { toWorkspaceAttachmentPath } from '@/lib/workspaceAttachmentPaths';
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

type AttachmentLoader = (
  filePath: string
) => Promise<{ dataUrl?: unknown } | null | undefined>;

export async function hydratePreviewImageSources(
  html: string,
  loadAttachment: AttachmentLoader = rpcLoadAttachment
): Promise<string> {
  if (!html.includes('<img') || typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;
  const images = Array.from(template.content.querySelectorAll('img[src]'));
  if (images.length === 0) {
    return html;
  }

  await Promise.all(
    images.map(async (image) => {
      const rawSrc = image.getAttribute('src');
      if (!rawSrc) {
        return;
      }
      const attachmentPath = toWorkspaceAttachmentPath(rawSrc);
      if (!attachmentPath) {
        return;
      }
      try {
        const result = await loadAttachment(attachmentPath);
        if (
          result &&
          typeof result.dataUrl === 'string' &&
          result.dataUrl.startsWith('data:image/')
        ) {
          image.setAttribute('src', result.dataUrl);
        }
      } catch {
        // Keep the original src so the browser can show its broken-image state.
      }
    })
  );

  return template.innerHTML;
}

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
    const [hydratedPreview, setHydratedPreview] = useState({
      html: previewHtml,
      source: previewHtml,
    });
    useEffect(() => {
      let cancelled = false;
      setHydratedPreview({ html: previewHtml, source: previewHtml });
      hydratePreviewImageSources(previewHtml).then((nextHtml) => {
        if (!cancelled) {
          setHydratedPreview({ html: nextHtml, source: previewHtml });
        }
      });
      return () => {
        cancelled = true;
      };
    }, [previewHtml]);

    const renderedPreviewHtml =
      hydratedPreview.source === previewHtml
        ? hydratedPreview.html
        : previewHtml;
    const fallbackText = toText(excerpt) || fallbackMarkdown || 'Empty note';

    if (!renderedPreviewHtml) {
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
        dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }}
      />
    );
  }
);

NotePreview.displayName = 'NotePreview';
