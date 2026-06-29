import DOMPurify from 'dompurify';
import {
  createElement,
  Fragment,
  memo,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { cn } from '@/lib/utils';
import { buildPreview } from '../../../shared/markdown/preview';
import {
  markdownAllowedTags,
  markdownSanitizeConfig,
} from '../../../shared/markdown/sanitize';
import { hydratePreviewImageSources } from './hydratePreviewImageSources';

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

const previewAllowedTags = new Set<string>(markdownAllowedTags);
const previewVoidTags = new Set(['br', 'hr', 'img']);

function propsForPreviewElement(element: Element): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const className = element.getAttribute('class');
  if (className) {
    props.className = className;
  }
  for (const attribute of ['alt', 'href', 'loading', 'rel', 'src', 'title']) {
    const value = element.getAttribute(attribute);
    if (value) {
      props[attribute] = value;
    }
  }
  const ariaHidden = element.getAttribute('aria-hidden');
  if (ariaHidden) {
    props['aria-hidden'] = ariaHidden;
  }
  return props;
}

function renderPreviewNode(node: Node, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();
  if (!previewAllowedTags.has(tagName)) {
    return null;
  }

  const props = { ...propsForPreviewElement(element), key };
  if (previewVoidTags.has(tagName)) {
    return createElement(tagName, props);
  }
  const children = Array.from(element.childNodes).map((child, index) =>
    renderPreviewNode(child, `${key}-${index}`)
  );
  return createElement(tagName, props, children);
}

function renderPreviewHtml(html: string): ReactNode {
  if (typeof DOMParser === 'undefined') {
    return null;
  }
  const documentFragment = new DOMParser().parseFromString(
    sanitizePreviewHtml(html),
    'text/html'
  );
  const children = Array.from(documentFragment.body.childNodes).map(
    (child, index) => renderPreviewNode(child, `${index}`)
  );
  return createElement(Fragment, null, children);
}

function NotePreviewComponent({
  className,
  excerpt,
  fallback,
  html,
}: NotePreviewProps) {
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
    hydratedPreview.source === previewHtml ? hydratedPreview.html : previewHtml;
  const renderedPreview = useMemo(
    () => renderPreviewHtml(renderedPreviewHtml),
    [renderedPreviewHtml]
  );
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
    >
      {renderedPreview}
    </div>
  );
}

export const NotePreview = memo(NotePreviewComponent);

NotePreview.displayName = 'NotePreview';
