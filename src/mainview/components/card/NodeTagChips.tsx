import { colorToStyle } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';

interface NodeTagChipsProps {
  /** Optional className applied to the outer wrapper for spacing tweaks. */
  className?: string;
  isDark?: boolean;
  tag?: string;
  tagColor?: string;
  tags?: string[];
}

/**
 * Reusable tag chip row for any canvas node. Renders the primary tag (with
 * colored background) followed by secondary tag chips. Returns null when no
 * tags are present so callers can mount it unconditionally without guarding.
 */
export function NodeTagChips({
  className,
  isDark = false,
  tag,
  tagColor,
  tags,
}: NodeTagChipsProps) {
  const hasPrimary = Boolean(tag);
  const hasSecondary = Array.isArray(tags) && tags.length > 0;
  if (!(hasPrimary || hasSecondary)) {
    return null;
  }
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {hasPrimary ? (
        <span
          className="rounded-md px-2 py-0.5 font-semibold text-xs"
          style={colorToStyle(tagColor)}
        >
          {tag}
        </span>
      ) : null}
      {tags?.map((t) => (
        <span
          className={cn(
            'rounded px-1.5 py-0.5 font-medium text-[10px]',
            isDark ? 'bg-white/15 text-white/85' : 'bg-black/6 text-neutral-700'
          )}
          key={t}
        >
          {t}
        </span>
      ))}
    </div>
  );
}
