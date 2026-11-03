/** Focused editors own the close decision (draft/save conflicts included). */
let current: { id: string; close: () => void } | null = null;
export function registerFocusedClose(
  id: string,
  close: () => void
): () => void {
  const entry = { id, close };
  current = entry;
  return () => {
    if (current === entry) {
      current = null;
    }
  };
}
export function requestRegisteredFocusClose(id: string): boolean {
  if (current?.id !== id) {
    return false;
  }
  current.close();
  return true;
}
