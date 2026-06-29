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
