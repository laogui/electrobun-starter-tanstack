export function collectNoteReferences(value: unknown): string[] {
  const ids = new Set<string>();
  const seen = new WeakSet<object>();
  const visit = (item: unknown) => {
    if (!item || typeof item !== 'object' || seen.has(item)) {
      return;
    }
    seen.add(item);
    if (Array.isArray(item)) {
      for (const child of item) {
        visit(child);
      }
      return;
    }
    for (const [key, child] of Object.entries(item)) {
      if (key === 'noteId' && typeof child === 'string') {
        ids.add(child);
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return [...ids];
}
