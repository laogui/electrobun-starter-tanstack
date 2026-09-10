const providers = new Set<(workspaceId: string) => string[]>();
export function registerNoteReferences(
  provider: (workspaceId: string) => string[]
): () => void {
  providers.add(provider);
  return () => {
    providers.delete(provider);
  };
}
export function getLiveNoteReferences(workspaceId: string): string[] {
  return [
    ...new Set([...providers].flatMap((provider) => provider(workspaceId))),
  ];
}
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
