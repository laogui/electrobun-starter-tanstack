import { create } from 'zustand';
import { unifiedUndoHistory } from '@/lib/unifiedUndoHistory';
import type { SearchResultTarget } from '../../shared/searchTypes';
import {
  type ClipboardSlice,
  createClipboardSlice,
} from './slices/clipboardSlice';
import { createEdgesSlice, type EdgesSlice } from './slices/edgesSlice';
import { createFolderSlice, type FolderSlice } from './slices/folderSlice';
import { createHistorySlice, type HistorySlice } from './slices/historySlice';
import {
  createNodeCreationSlice,
  type NodeCreationSlice,
} from './slices/nodeCreationSlice';
import { createNodesSlice, type NodesSlice } from './slices/nodesSlice';
import {
  createPersistenceSlice,
  type PersistenceSlice,
} from './slices/persistenceSlice';
import {
  createSelectionSlice,
  type SelectionSlice,
} from './slices/selectionSlice';
import { createTopicsSlice, type TopicsSlice } from './slices/topicsSlice';
import { createUiSlice, type UiSlice } from './slices/uiSlice';
import {
  createViewportSlice,
  type ViewportSlice,
} from './slices/viewportSlice';

export { previewTopicDraft, previewTopicEdits } from './canvas/topicGraph';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface FocusedItem {
  data: Record<string, unknown>;
  /** Owning folder id when this item is an embedded folder child. */
  folderId?: string;
  id: string;
  rect: DOMRect;
  type?: string;
}

export interface PendingSearchTarget {
  edgeId?: string;
  nodeId?: string;
  target?: SearchResultTarget;
  viewId: string;
}

export interface CreateNodeOptions {
  /** Top-left anchor in flow coords. Takes precedence over `anchorCenter`. */
  anchor?: { x: number; y: number };
  /** Desired center of the new node in flow coords. */
  anchorCenter?: { x: number; y: number };
  /** Override the node kind's group-adoption rule for this placement. */
  canEnterGroup?: boolean;
  /** Additional data to merge over the node kind's registry defaults. */
  data?: Record<string, unknown>;
  /** When false, skip the post-create viewport pan (batch imports). Default true. */
  focusViewport?: boolean;
  /**
   * Override the node kind's default size. Used by image imports to size the
   * card to the dropped image's aspect ratio instead of the fixed default.
   */
  size?: { height: number; width: number };
}

export interface AddConnectionOptions {
  reverseVisualDirection?: boolean;
}

/**
 * A new Topic the user is typing but has not committed.
 *
 * A draft is deliberately *not* a graph node: it holds no id in `nodes`, writes
 * no edge, produces no history entry, and is never persisted. The first
 * non-empty commit turns the title, node, and layout into a single transaction,
 * so creating a Topic costs exactly one undo step and abandoning one costs
 * nothing.
 */
export interface TopicDraft {
  /** Top-left in flow coordinates, relative to `parentId` when set. */
  anchor: { x: number; y: number };
  /** Render-only id for the temporary node. Never persisted. */
  id: string;
  /** Group container the committed Topic will join. */
  parentId?: string;
  /**
   * Tree position this draft will take. Absent for a standalone root.
   * Re-validated after the async quota check — the anchor Topic may have been
   * deleted or locked while the check was in flight.
   */
  relation?: {
    kind: 'child' | 'sibling';
    /** Parent for `child`, preceding sibling for `sibling`. */
    topicId: string;
  };
  /** Current editor text, mirrored here so the node can resize while typing. */
  text: string;
  /** View the draft belongs to. A commit that resolves after a view switch is
   *  discarded rather than written into whatever canvas is now open. */
  viewId: string;
}

/**
 * Full canvas store shape: the intersection of every slice. Each slice owns
 * its state keys and actions; cross-slice calls go through `get()`.
 */
export interface CanvasState
  extends UiSlice,
    ViewportSlice,
    HistorySlice,
    EdgesSlice,
    NodesSlice,
    PersistenceSlice,
    TopicsSlice,
    SelectionSlice,
    ClipboardSlice,
    NodeCreationSlice,
    FolderSlice {}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCanvasStore = create<CanvasState>()((...args) => ({
  ...createUiSlice(...args),
  ...createViewportSlice(...args),
  ...createHistorySlice(...args),
  ...createEdgesSlice(...args),
  ...createNodesSlice(...args),
  ...createPersistenceSlice(...args),
  ...createTopicsSlice(...args),
  ...createSelectionSlice(...args),
  ...createClipboardSlice(...args),
  ...createNodeCreationSlice(...args),
  ...createFolderSlice(...args),
}));

unifiedUndoHistory.setNativeView(useCanvasStore.getState().activeViewId);
useCanvasStore.subscribe((state, previous) => {
  if (
    state.activeViewId !== previous.activeViewId ||
    (state._hydrated && !previous._hydrated)
  ) {
    unifiedUndoHistory.setNativeView(state.activeViewId);
  }
});
unifiedUndoHistory.onBranch(() => {
  const { _undoRedo } = useCanvasStore.getState();
  if (_undoRedo.future.length > 0) {
    useCanvasStore.setState({ _undoRedo: { ..._undoRedo, future: [] } });
  }
});
