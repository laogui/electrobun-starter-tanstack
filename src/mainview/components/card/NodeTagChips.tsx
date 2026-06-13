import { colorToStyle } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';

interface NodeTagChipsProps {
  /** Optional className applied to the outer wrapper for spacing tweaks. */
  className?: string;
  isDark?: boolean;
  tag?: string;
  tagColor?: string;
  tagColors?: Record<string, string>;
  tags?: string[];
}

export interface NodeTagItem {
  color?: string;
  name: string;
}

function pushUniqueTag(items: NodeTagItem[], item: NodeTagItem) {
  const key = item.name.trim().toLowerCase();
  if (!key || items.some((existing) => existing.name.toLowerCase() === key)) {
    return;
  }
  items.push({ ...item, name: item.name.trim() });
}

function colorForTag(
  name: string,
  tagColors: Record<string, string> | undefined
): string | undefined {
  if (!tagColors) {
    return;
  }
  const key = name.toLowerCase();
  const match = Object.entries(tagColors).find(
    ([tagName]) => tagName.toLowerCase() === key
  );
  return match?.[1];
}

export function getNodeTagItems({
  tag,
  tagColor,
  tagColors,
  tags,
}: {
  tag?: string;
  tagColor?: string;
  tagColors?: Record<string, string>;
  tags?: string[];
}): NodeTagItem[] {
  const items: NodeTagItem[] = [];
  if (tag) {
    pushUniqueTag(items, {
      color: tagColor ?? colorForTag(tag, tagColors),
      name: tag,
    });
  }
  for (const value of tags ?? []) {
    pushUniqueTag(items, {
      color: colorForTag(value, tagColors),
      name: value,
    });
  }
  return items;
}

/**
 * Reusable tag chip row for any canvas node. Legacy `tag/tagColor` metadata is
 * merged with `tags/tagColors` so the UI only shows one tag system.
 */
export function NodeTagChips({
  className,
  isDark = false,
  tag,
  tagColor,
  tagColors,
  tags,
}: NodeTagChipsProps) {
  const items = getNodeTagItems({ tag, tagColor, tagColors, tags });
  if (items.length === 0) {
    return null;
  }
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {items.map((item) => (
        <span
          className={cn(
            'rounded-md border px-2 py-0.5 font-medium text-xs',
            item.color
              ? 'border-black/5 text-neutral-800'
              : isDark
                ? 'border-white/10 bg-white/15 text-white/85'
                : 'border-black/5 bg-black/6 text-neutral-700'
          )}
          key={item.name}
          style={colorToStyle(item.color)}
        >
          {item.name}
        </span>
      ))}
    </div>
  );
}
