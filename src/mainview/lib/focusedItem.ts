import { requestRegisteredFocusClose } from '@/lib/focusedCloseRequest';
import { markOpenRequested } from '@/lib/perfMarks';
import type { FolderChildEntry } from '@/store/canvas/folderChildren';
import type { FocusedItem } from '@/store/canvasStore';
import { useCanvasStore } from '@/store/canvasStore';

/**
 * Open `item` in the card side panel (or the image lightbox). The item's data
 * is re-read from the live canvas so a stale snapshot never opens, and an
 * item that no longer exists is refused. Opening another card while one is
 * open replaces it (one card at a time in v1).
 */
export function openFocusedItem(item: FocusedItem): boolean {
  markOpenRequested();
  const state = useCanvasStore.getState();
  const live = findLiveItem(state.nodes, item.id, item.folderId);
  if (!live) {
    return false;
  }
  state.setFocusedNode({ ...item, data: live.data, type: live.type });
  return true;
}

/**
 * Close the open card. Unless `confirmed`, the open editor decides first
 * (it may hold an unresolved save conflict and ask before leaving).
 */
export function closeFocusedView(confirmed = false): void {
  const { focusedNode, setFocusedNode } = useCanvasStore.getState();
  if (!focusedNode) {
    return;
  }
  if (!confirmed && requestRegisteredFocusClose(focusedNode.id)) {
    return;
  }
  setFocusedNode(null);
}

interface LiveItem {
  data: Record<string, unknown>;
  type?: string;
}

export function findLiveItem(
  nodes: ReadonlyArray<{
    data: Record<string, unknown>;
    id: string;
    type?: string;
  }>,
  id: string,
  folderId?: string
): LiveItem | null {
  if (!folderId) {
    const node = nodes.find((candidate) => candidate.id === id);
    return node ? { data: node.data, type: node.type } : null;
  }
  const parent = nodes.find((candidate) => candidate.id === folderId);
  const children = parent?.data.children;
  if (!Array.isArray(children)) {
    return null;
  }
  const child = (children as FolderChildEntry[]).find(
    (entry) => entry?.id === id
  );
  return child?.data ? { data: child.data, type: child.type } : null;
}
