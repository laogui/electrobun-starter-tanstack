/** Focused editors own the departure decision (draft/save conflicts included). */
let current: {
  id: string;
  onLeave: (leave?: () => void) => void;
} | null = null;
export function registerFocusedClose(
  id: string,
  onLeave: (leave?: () => void) => void
): () => void {
  const entry = { id, onLeave };
  current = entry;
  return () => {
    if (current === entry) {
      current = null;
    }
  };
}
export function requestRegisteredFocusClose(
  id: string,
  leave?: () => void
): boolean {
  if (current?.id !== id) {
    return false;
  }
  current.onLeave(leave);
  return true;
}
