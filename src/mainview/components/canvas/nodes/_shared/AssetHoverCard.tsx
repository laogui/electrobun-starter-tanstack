import { PreviewCard } from '@base-ui/react/preview-card';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Hover info panel for canvas asset/image cards.
 *
 * Uses Base UI's `PreviewCard` (the HoverCard equivalent) so the popup is
 * portaled out of the ReactFlow transformed pane — it renders in screen space
 * and is unaffected by canvas pan/zoom. Mirrors the popover recipe established
 * by `TagEditor.tsx` (Portal + Positioner + `nodrag nopan`).
 *
 * The trigger wraps the card in a `<div>` (Base UI's Trigger renders an `<a>`
 * by default; the `render` prop swaps it for a neutral div that still receives
 * the hover/focus handlers). Hover is suppressed when `enabled` is false
 * (e.g. when zoomed out) to match the existing `NodeTagChips` gating.
 */
export function AssetHoverCard({
  children,
  enabled = true,
  rows,
}: {
  children: ReactNode;
  enabled?: boolean;
  rows: { label: string; value: ReactNode }[];
}) {
  if (!enabled || rows.length === 0) {
    return <>{children}</>;
  }
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        closeDelay={200}
        delay={300}
        render={<div className="size-full" />}
      >
        {children}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner align="start" side="top" sideOffset={8}>
          <PreviewCard.Popup className="nodrag nopan z-50 w-64 origin-(--transform-origin) rounded-lg border border-black/5 bg-white p-3 text-sm shadow-xl outline-none dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-100">
            <dl className="flex flex-col gap-1.5">
              {rows.map((row) => (
                <div
                  className="flex items-start justify-between gap-3"
                  key={row.label}
                >
                  <dt className="shrink-0 text-neutral-400 text-xs uppercase tracking-wide dark:text-neutral-500">
                    {row.label}
                  </dt>
                  <dd
                    className={cn(
                      'min-w-0 break-words text-right text-neutral-800 dark:text-neutral-100'
                    )}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
