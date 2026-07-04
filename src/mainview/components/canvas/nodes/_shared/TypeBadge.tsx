import { cn } from '@/lib/utils';

/**
 * Shared file-type badge rendered on canvas node cards.
 *
 * Extracted from the inline pill that lived in `AssetNode.tsx`,
 * `ImageNode.tsx` and `LinkNode.tsx` so every node uses the same
 * shape / contrast rules. The `missing` variant mirrors the original
 * red treatment used by asset nodes.
 */
export function TypeBadge({
  children,
  className,
  missing = false,
}: {
  children: React.ReactNode;
  className?: string;
  missing?: boolean;
}) {
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-1 font-semibold text-2xs uppercase tracking-normal',
        missing
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200'
          : 'border-black/10 bg-white/60 text-neutral-500 dark:border-white/10 dark:bg-white/10 dark:text-neutral-300',
        className
      )}
    >
      {children}
    </span>
  );
}
