import { Loader2 } from 'lucide-react';

import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';

import * as m from '../../../paraglide/messages.js';

interface NoteEditorLoadingProps {
  color?: unknown;
  /** Optional title to show while the editor is loading. */
  title?: string;
}

/**
 * Skeleton + spinner shown while the BlockNote chunk or note body loads.
 * Keeps the focused surface tinted with the card color so the open morph
 * never lands on a blank white page.
 */
export function NoteEditorLoading({ color, title }: NoteEditorLoadingProps) {
  const colorValue = typeof color === 'string' ? color : '#FFFFFF';
  const isDark = isColorDark(colorValue);
  const pulse = isDark ? 'bg-white/15' : 'bg-black/8';
  const pulseSoft = isDark ? 'bg-white/10' : 'bg-black/5';
  const titleText = typeof title === 'string' ? title.trim() : '';

  return (
    <output
      aria-busy="true"
      aria-live="polite"
      className={cn(
        'relative flex h-full w-full flex-col',
        isDark ? 'text-white' : 'text-zinc-900'
      )}
      style={colorToStyle(colorValue)}
    >
      <div className="mx-auto flex w-full max-w-[min(88ch,90%)] flex-1 flex-col gap-6 px-8 pt-16 pb-10 md:px-12 md:pt-20">
        {titleText ? (
          <h1
            className={cn(
              'truncate font-bold text-3xl tracking-tight md:text-4xl',
              isDark ? 'text-white/90' : 'text-zinc-900/90'
            )}
          >
            {titleText}
          </h1>
        ) : (
          <div className={cn('h-10 w-2/3 animate-pulse rounded-md', pulse)} />
        )}

        <div className="flex flex-1 flex-col gap-3 pt-2">
          <div className={cn('h-4 w-full animate-pulse rounded', pulseSoft)} />
          <div className={cn('h-4 w-[92%] animate-pulse rounded', pulseSoft)} />
          <div className={cn('h-4 w-4/5 animate-pulse rounded', pulseSoft)} />
          <div className={cn('h-4 w-5/6 animate-pulse rounded', pulseSoft)} />
          <div
            className={cn('mt-4 h-4 w-3/5 animate-pulse rounded', pulseSoft)}
          />
          <div className={cn('h-4 w-3/4 animate-pulse rounded', pulseSoft)} />
          <div className={cn('h-4 w-2/3 animate-pulse rounded', pulseSoft)} />
        </div>
      </div>

      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-10 flex items-center justify-center gap-2 text-sm',
          isDark ? 'text-white/55' : 'text-zinc-500'
        )}
      >
        <Loader2 aria-hidden className="size-4 animate-spin" />
        <span>{m.focused_loading()}</span>
      </div>
    </output>
  );
}
