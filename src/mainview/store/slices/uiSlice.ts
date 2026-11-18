// Canvas store slice: Transient UI state: dialogs, sidebars, focus targets, tag filters, search.
import type { StateCreator } from 'zustand';
import { canvasTypeRegistry } from '@/extensions/registry';
import { markOpenRequested } from '@/lib/perfMarks';
import type {
  CanvasState,
  FocusedItem,
  PendingSearchTarget,
} from '../canvasStore';

export interface UiSlice {
  /** Changes on focus identity transitions, including close and reopen. */
  _focusSession: number;
  /**
   * Active tag filters (OR semantics, case-insensitive). When non-empty,
   * cards that do not carry at least one of these tags are dimmed on the
   * canvas. Closing the tag sidebar clears this list — see
   * {@link setTagSidebarOpen}.
   */
  activeTagFilters: string[];
  /** Drop every active tag filter. */
  clearTagFilters: () => void;

  createMenuOpen: boolean;
  /** Folder id whose info (name + description) dialog is open. */
  editingFolderId: string | null;
  /** Sticky id that should enter inline text editing (driven by Enter key). */
  editingStickyId: string | null;
  /** Card id whose TagEditor should auto-open (driven by context-menu action). */
  editingTagNodeId: string | null;
  focusedFolder: FocusedItem | null;

  /**
   * How the open card is shown: beside the canvas in the side panel, or
   * full screen for writing. Resets to `panel` when the card closes.
   */
  focusedMode: FocusedMode;
  focusedNode: FocusedItem | null;

  // Library popup (browse notes on the current canvas)
  libraryOpen: boolean;

  /** When pinned, clicking blank canvas keeps the side panel open. */
  panelPinned: boolean;

  pendingSearchQuery: string | null;
  pendingSearchTarget: PendingSearchTarget | null;
  /** Asset/image card id whose displayName is in inline-rename mode. */
  renamingNodeId: string | null;
  searchOpen: boolean;

  /** Replace the entire active-tag-filters list. */
  setActiveTagFilters: (tags: string[]) => void;
  setCreateMenuOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setEditingFolderId: (id: string | null) => void;
  setEditingStickyId: (id: string | null) => void;
  setEditingTagNodeId: (id: string | null) => void;
  setFocusedFolder: (v: FocusedItem | null) => void;

  setFocusedMode: (mode: FocusedMode) => void;
  setFocusedNode: (v: FocusedItem | null) => void;
  setLibraryOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setPanelPinned: (v: boolean | ((prev: boolean) => boolean)) => void;
  setPendingSearchQuery: (query: string | null) => void;
  setPendingSearchTarget: (target: PendingSearchTarget | null) => void;
  setRenamingNodeId: (id: string | null) => void;
  setSearchOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setSettingsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setTagSidebarOpen: (v: boolean | ((prev: boolean) => boolean)) => void;

  // In-window settings dialog
  settingsOpen: boolean;

  // Tag filter sidebar (workspace-wide tag list)
  tagSidebarOpen: boolean;
  toggleLibrary: () => void;
  /** Toggle a single tag in/out of the active filters (case-insensitive). */
  toggleTagFilter: (tag: string) => void;
  toggleTagSidebar: () => void;
}

/** `lightbox` is the full-screen image viewer opened from the panel. */
export type FocusedMode = 'panel' | 'fullscreen' | 'lightbox';

function resolveNextFocusedMode(
  currentMode: FocusedMode,
  nextItem: FocusedItem | null
): FocusedMode {
  if (!nextItem || currentMode === 'lightbox') {
    return 'panel';
  }
  const isLightboxKind =
    nextItem.type === 'image' ||
    (nextItem.type === 'extension' &&
      typeof nextItem.data.canvasTypeId === 'string' &&
      canvasTypeRegistry.get(nextItem.data.canvasTypeId)?.surface
        .detailLayout === 'lightbox');
  if (currentMode === 'fullscreen' && isLightboxKind) {
    return 'panel';
  }
  return currentMode;
}

export const createUiSlice: StateCreator<CanvasState, [], [], UiSlice> = (
  set,
  get
) => ({
  _focusSession: 0,
  focusedMode: 'panel',
  focusedNode: null,
  focusedFolder: null,
  createMenuOpen: false,
  editingFolderId: null,
  editingStickyId: null,
  editingTagNodeId: null,
  renamingNodeId: null,
  searchOpen: false,
  settingsOpen: false,
  pendingSearchQuery: null,
  pendingSearchTarget: null,
  libraryOpen: false,
  panelPinned: false,
  tagSidebarOpen: false,
  activeTagFilters: [],

  setLibraryOpen: (v) => {
    set((s) => ({
      libraryOpen: typeof v === 'function' ? v(s.libraryOpen) : v,
    }));
  },

  toggleLibrary: () => {
    set((s) => ({ libraryOpen: !s.libraryOpen }));
  },

  // Closing the tag sidebar always clears active filters — the sidebar is
  // the *only* surface for managing them, so leaving them set while the
  // panel is hidden creates an invisible "why are my cards dimmed?" trap.
  setTagSidebarOpen: (v) => {
    set((s) => {
      const next = typeof v === 'function' ? v(s.tagSidebarOpen) : v;
      if (next === s.tagSidebarOpen) {
        return s;
      }
      return {
        tagSidebarOpen: next,
        activeTagFilters: next ? s.activeTagFilters : [],
      };
    });
  },

  toggleTagSidebar: () => {
    get().setTagSidebarOpen(!get().tagSidebarOpen);
  },

  setActiveTagFilters: (tags) => {
    set({ activeTagFilters: tags });
  },

  toggleTagFilter: (tag) => {
    const needle = tag.toLowerCase();
    set((s) => {
      const present = s.activeTagFilters.some(
        (t) => t.toLowerCase() === needle
      );
      return {
        activeTagFilters: present
          ? s.activeTagFilters.filter((t) => t.toLowerCase() !== needle)
          : [...s.activeTagFilters, tag],
      };
    });
  },

  clearTagFilters: () => {
    set({ activeTagFilters: [] });
  },

  setEditingFolderId: (id) => {
    set({ editingFolderId: id });
  },

  setEditingStickyId: (id) => {
    set({ editingStickyId: id });
  },

  setEditingTagNodeId: (id) => {
    set({ editingTagNodeId: id });
  },

  setRenamingNodeId: (id) => {
    set({ renamingNodeId: id });
  },

  setFocusedNode: (v) => {
    if (v) {
      markOpenRequested();
    }
    set((s) => {
      const switched =
        s.focusedNode?.id !== v?.id ||
        s.focusedNode?.folderId !== v?.folderId ||
        Boolean(s.focusedNode) !== Boolean(v);
      return {
        focusedNode: v,
        focusedMode: switched
          ? resolveNextFocusedMode(s.focusedMode, v)
          : s.focusedMode,
        ...(v ? {} : { panelPinned: false }),
        _focusSession: switched ? s._focusSession + 1 : s._focusSession,
      };
    });
  },

  setFocusedMode: (mode) => {
    set({ focusedMode: mode });
  },

  setPanelPinned: (v) => {
    set((s) => ({
      panelPinned: typeof v === 'function' ? v(s.panelPinned) : v,
    }));
  },

  setFocusedFolder: (v) => {
    set({ focusedFolder: v });
  },

  setCreateMenuOpen: (v) => {
    set((s) => ({
      createMenuOpen: typeof v === 'function' ? v(s.createMenuOpen) : v,
    }));
  },

  setSearchOpen: (v) => {
    set((s) => ({
      searchOpen: typeof v === 'function' ? v(s.searchOpen) : v,
    }));
  },

  setSettingsOpen: (v) => {
    set((s) => ({
      settingsOpen: typeof v === 'function' ? v(s.settingsOpen) : v,
    }));
  },

  setPendingSearchQuery: (query) => {
    set({ pendingSearchQuery: query });
  },

  setPendingSearchTarget: (target) => {
    set({ pendingSearchTarget: target });
  },
});
