import { NotePreview } from '@/components/preview/NotePreview';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';

import * as m from '../../../paraglide/messages.js';

interface FocusedNotePreviewProps {
  color?: unknown;
  data: Record<string, unknown>;
  title?: string;
}

/**
 * Static, read-only stand-in for the focused BlockNote editor. Rendered during
 * the open animation (cheap: sanitized preview HTML, no ProseMirror) and laid
 * out with the same surface, container, title and block metrics as
 * `BlockNoteSurface`, so the crossfade to the live editor does not shift text.
 */
export function FocusedNotePreview({
  color,
  data,
  title,
}: FocusedNotePreviewProps) {
  const colorValue = typeof color === 'string' ? color : '#FFFFFF';
  const isDark = isColorDark(colorValue);
  const titleText = typeof title === 'string' ? title : '';

  return (
    <div
      aria-hidden
      className={cn(
        'note-editor-surface pointer-events-none flex h-full w-full select-none flex-col overflow-hidden',
        isDark ? 'text-white' : 'text-gray-900'
      )}
      style={colorToStyle(colorValue)}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className="mx-auto w-full max-w-[min(88ch,90%)] px-4 py-12 sm:px-8 lg:px-12"
          data-focus-surface
          style={colorToStyle(colorValue)}
        >
          <h1
            className={cn(
              'mb-2 block w-full whitespace-pre-wrap break-words pl-[54px] font-bold text-4xl leading-tight tracking-normal',
              !titleText && (isDark ? 'text-white/40' : 'text-gray-600/60')
            )}
            data-focus-title
          >
            {titleText || m.editor_title_placeholder()}
          </h1>
          <NotePreview
            excerpt={data.previewExcerpt}
            fallback={data.content}
            html={data.previewHtml}
            variant="editor"
          />
        </div>
      </div>
    </div>
  );
}
