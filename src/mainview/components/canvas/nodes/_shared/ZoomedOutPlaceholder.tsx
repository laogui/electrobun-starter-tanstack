import type { CSSProperties, ReactNode } from 'react';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';

/**
 * Default skeleton bar widths, cycled through so any bar count keeps a natural
 * ragged-paragraph rhythm.
 */
const DEFAULT_LINE_WIDTHS = [
  'w-full',
  'w-5/6',
  'w-4/6',
  'w-full',
  'w-3/4',
] as const;

export interface SkeletonLinesProps {
  /** Extra classes on the wrapping group (spacing / opacity overrides). */
  className?: string;
  /** Bar count when `widths` is omitted; uses the default width rhythm. */
  count?: number;
  /** Bar thickness. */
  size?: 'sm' | 'md';
  /** Explicit per-bar widths (Tailwind classes); its length sets the bar count. */
  widths?: readonly string[];
}

/**
 * The grey "text stand-in" bars shown on zoomed-out nodes. Extracted so every
 * node type renders identical skeleton lines and a new node type can drop them
 * in without re-deriving widths / spacing / opacity.
 */
export function SkeletonLines({
  widths,
  count = 5,
  size = 'md',
  className,
}: SkeletonLinesProps) {
  const resolvedWidths =
    widths ??
    Array.from(
      { length: count },
      (_, i) => DEFAULT_LINE_WIDTHS[i % DEFAULT_LINE_WIDTHS.length]
    );
  return (
    <div
      className={cn(
        'opacity-30',
        size === 'sm' ? 'space-y-2' : 'space-y-3',
        className
      )}
    >
      {resolvedWidths.map((width, i) => (
        <div
          className={cn(
            'rounded-full bg-current',
            size === 'sm' ? 'h-2' : 'h-3',
            width
          )}
          // Static decoration with no stable identity, so index-based keys are fine.
          key={`${width}-${i}`}
        />
      ))}
    </div>
  );
}

/** Row widths cycled through by {@link SkeletonChecklist}. */
const CHECKLIST_ROW_WIDTHS = [
  'w-4/6',
  'w-5/6',
  'w-3/6',
  'w-4/6',
  'w-2/6',
] as const;

export interface SkeletonChecklistProps {
  /** Extra classes on the wrapping group (spacing / opacity overrides). */
  className?: string;
  /** Number of fake checklist rows. */
  rows?: number;
}

/** Checklist-flavored skeleton: a fake checkbox square plus a text bar per row. */
export function SkeletonChecklist({
  rows = 4,
  className,
}: SkeletonChecklistProps) {
  return (
    <div className={cn('space-y-3 opacity-30', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="flex items-center gap-2" key={`row-${i}`}>
          <div className="size-3 shrink-0 rounded-sm border border-current" />
          <div
            className={cn(
              'h-3 rounded-full bg-current',
              CHECKLIST_ROW_WIDTHS[i % CHECKLIST_ROW_WIDTHS.length]
            )}
          />
        </div>
      ))}
    </div>
  );
}

const PADDING_CLASS = {
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
} as const;

export interface ZoomedOutPlaceholderProps {
  /** Vertical placement of the content block. */
  align?: 'start' | 'center';
  /**
   * Body content — typically {@link SkeletonLines} / {@link SkeletonChecklist}
   * or a truncated preview. Body elements own their top margin.
   */
  children?: ReactNode;
  /** Extra classes on the outer container (rounding, overflow, etc.). */
  className?: string;
  /** Node background color; also decides light vs dark text. */
  color?: string;
  /**
   * Leading visual (icon, tag chip, thumbnail) rendered above the title. Do not
   * add a bottom margin — the shell spaces it from the title.
   */
  leading?: ReactNode;
  /** Inner padding scale. */
  padding?: 'sm' | 'md' | 'lg';
  /** Inline styles merged after the derived background color. */
  style?: CSSProperties;
  /** Prominent title kept legible while zoomed out. */
  title?: ReactNode;
  /** Overrides the default title classes (e.g. a smaller size). */
  titleClassName?: string;
}

/**
 * Shared shell for a node's zoomed-out placeholder: the colored surface, the
 * light/dark text handling, an optional leading visual, a legible title, and a
 * body slot for skeleton lines or a custom preview.
 *
 * Centralizes the look so adding a new node type only means composing this with
 * the right leading icon + skeleton, instead of hand-rolling the layout again.
 */
export function ZoomedOutPlaceholder({
  color,
  align = 'start',
  padding = 'md',
  leading,
  title,
  titleClassName,
  children,
  className,
  style,
}: ZoomedOutPlaceholderProps) {
  return (
    <div
      className={cn(
        'flex size-full flex-col',
        align === 'center' && 'justify-center',
        PADDING_CLASS[padding],
        isColorDark(color) && 'text-white',
        className
      )}
      style={{ ...colorToStyle(color), ...style }}
    >
      {leading ? <div className="mb-4">{leading}</div> : null}
      {title ? (
        <h2
          className={cn(
            'line-clamp-2 font-bold text-2xl/tight',
            titleClassName
          )}
        >
          {title}
        </h2>
      ) : null}
      {children}
    </div>
  );
}
