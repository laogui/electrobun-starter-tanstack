import {
  BookOpen,
  ChevronRight,
  ClipboardPaste,
  Copy,
  CopyPlus,
  ExternalLink,
  FileDown,
  FilePlus,
  FolderOpen,
  Group,
  Image as ImageIcon,
  Layers,
  Link as LinkIcon,
  Lock,
  LogOut,
  Maximize2,
  Palette,
  PenLine,
  Plus,
  RefreshCw,
  Sparkles,
  Spline,
  Tag,
  Trash2,
  Unlock,
  ZoomIn,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as motion from 'motion/react-m';
import {
  type ElementType,
  type SetStateAction,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { getCanvasTypeMenuItems } from '@/extensions/createMenu';
import {
  type AssembledExtensionMenuItem,
  assembleExtensionMenuItems,
  type HostGenericMenuActionId,
  resolveExtensionNodeRef,
} from '@/extensions/hostMenu';
import { resolveExtensionMessage } from '@/extensions/messages';
import { canvasTypeRegistry } from '@/extensions/registry';
import { getCreatableMenuItems } from '@/lib/creatableNodes';
import { buildTopicIndex } from '@/lib/topicTree';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionEnablementStore } from '@/store/extensionEnablementStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';

import * as m from '../../../paraglide/messages.js';
import { isExtensionInstanceLoadError } from '../../../shared/extensions/instance';
import { isTopicNodeType, isTopicTreeEdge } from '../../../shared/topic';

interface MenuItem {
  danger?: boolean;
  disabled?: boolean;
  icon: ElementType;
  id: string;
  label: string;
  shortcut?: string;
  submenu?: MenuItem[];
}

interface ViewSummary {
  id: string;
  name: string;
}

function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  return {
    x: Math.max(8, Math.min(x, Math.max(8, window.innerWidth - width - 8))),
    y: Math.max(8, Math.min(y, Math.max(8, window.innerHeight - height - 8))),
  };
}

type ContextMenuState = {
  x: number;
  y: number;
  target:
    | 'canvas'
    | 'asset'
    | 'card'
    | 'folder-child'
    | 'image'
    | 'link'
    | 'folder'
    | 'group'
    | 'sticky'
    | 'topic'
    | 'recording'
    | 'widget'
    | 'extension'
    | 'multi'
    | 'edge'
    | 'widget';
  nodeId?: string;
  edgeId?: string;
  /** Present when the target is an expanded child stored inside a folder. */
  folderId?: string;
} | null;

const getCanvasItems = (
  hasClipboard: boolean,
  hasTopics: boolean
): MenuItem[] => [
  {
    id: 'new',
    label: m.menu_new(),
    icon: Plus,
    submenu: getCreatableMenuItems(
      'short',
      getCanvasTypeMenuItems(
        canvasTypeRegistry.listEnabled(
          useExtensionEnablementStore.getState().disabledCanvasTypes
        ),
        resolveExtensionMessage
      )
    ).map((item) => ({
      id: `new-${item.id}`,
      label: item.label,
      icon: item.icon,
    })),
  },
  {
    id: 'paste',
    label: m.menu_paste(),
    icon: ClipboardPaste,
    shortcut: '⌘V',
    disabled: !hasClipboard,
  },
  { id: 'reset-zoom', label: m.menu_reset_zoom(), icon: ZoomIn },
  {
    id: 'import-markdown',
    label: m.menu_import_markdown(),
    icon: FilePlus,
  },
  {
    id: 'export-canvas-markdown',
    label: m.menu_export_canvas_markdown(),
    icon: FileDown,
  },
  {
    id: 'export-topic-outline',
    label: m.menu_export_topic_outline(),
    icon: FileDown,
    // Nothing to project when the canvas has no Topics; offering the action
    // would only produce an empty file.
    disabled: !hasTopics,
  },
];

const lockItem = (locked: boolean): MenuItem => ({
  id: 'toggle-lock',
  label: locked ? m.menu_unlock() : m.menu_lock(),
  icon: locked ? Unlock : Lock,
});

const getCardItems = (locked: boolean): MenuItem[] => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'copy-as-markdown', label: m.menu_copy_as_markdown(), icon: Copy },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  {
    id: 'ai-summarize',
    label: m.menu_ai_summarize(),
    icon: Sparkles,
  },
  lockItem(locked),
  { id: 'detach-from-canvas', label: m.menu_move_to_library(), icon: BookOpen },
  { id: 'export-markdown', label: m.menu_export_markdown(), icon: FileDown },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getFolderChildItems = (): MenuItem[] => [
  { id: 'move-out', label: m.menu_move_out(), icon: LogOut },
];

const EXPANDED_FOLDER_CHILD_ACTIONS = new Set([
  'focus',
  'copy',
  'copy-as-markdown',
  'change-color',
  'export-markdown',
  'open-link',
  'copy-url',
  'refetch-link',
  'edit-url',
  'copy-image-address',
  'reveal-in-finder',
  'delete',
]);

function getExpandedFolderChildItems(baseItems: MenuItem[]): MenuItem[] {
  const supported = baseItems.filter((item) =>
    EXPANDED_FOLDER_CHILD_ACTIONS.has(item.id)
  );
  const deleteIndex = supported.findIndex((item) => item.id === 'delete');
  const moveOut = getFolderChildItems()[0]!;
  if (deleteIndex === -1) {
    return [...supported, moveOut];
  }
  return [
    ...supported.slice(0, deleteIndex),
    moveOut,
    ...supported.slice(deleteIndex),
  ];
}

const getFolderItems = (locked: boolean): MenuItem[] => [
  {
    id: 'open-folder',
    label: m.menu_open(),
    icon: FolderOpen,
    shortcut: 'Enter',
  },
  { id: 'edit-folder', label: m.menu_edit_folder_info(), icon: PenLine },
  { id: 'new-child', label: m.menu_new_card_inside(), icon: FilePlus },
  lockItem(locked),
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

/**
 * `hasParent` gates the sibling and detach actions: a root has no sibling slot
 * and no parent relation to cut.
 */
const getTopicItems = (locked: boolean, hasParent: boolean): MenuItem[] => [
  { id: 'edit-topic-title', label: m.menu_edit_label(), icon: PenLine },
  {
    id: 'topic-new-child',
    label: m.menu_topic_new_child(),
    icon: Plus,
    shortcut: '⇥',
  },
  ...(hasParent
    ? [
        {
          id: 'topic-new-sibling',
          label: m.menu_topic_new_sibling(),
          icon: Plus,
          shortcut: '⏎',
        },
      ]
    : []),
  {
    id: 'topic-select-branch',
    label: m.menu_topic_select_branch(),
    icon: Layers,
  },
  {
    id: 'topic-copy-branch',
    label: m.menu_topic_copy_branch(),
    icon: Copy,
  },
  {
    id: 'topic-tidy-branch',
    label: m.menu_topic_tidy_branch(),
    icon: Sparkles,
  },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  lockItem(locked),
  ...(hasParent
    ? [
        {
          id: 'topic-detach-branch',
          label: m.menu_topic_detach_branch(),
          icon: LogOut,
        },
      ]
    : []),
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
  {
    id: 'topic-delete-branch',
    label: m.menu_topic_delete_branch(),
    icon: Trash2,
    danger: true,
  },
];

const getStickyItems = (locked: boolean): MenuItem[] => [
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  {
    id: 'ai-summarize',
    label: m.menu_ai_summarize(),
    icon: Sparkles,
  },
  lockItem(locked),
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getGroupItems = (locked: boolean): MenuItem[] => [
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  lockItem(locked),
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getImageItems = (locked: boolean): MenuItem[] => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  { id: 'replace-image', label: m.menu_replace_image(), icon: ImageIcon },
  {
    id: 'copy-image-address',
    label: m.menu_copy_image_address(),
    icon: Copy,
  },
  {
    id: 'reveal-in-finder',
    label: m.menu_reveal_in_finder(),
    icon: FolderOpen,
  },
  { id: 'rename-asset', label: m.menu_rename_asset(), icon: PenLine },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  lockItem(locked),
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getLinkItems = (locked: boolean): MenuItem[] => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  { id: 'open-link', label: m.menu_open_link(), icon: ExternalLink },
  { id: 'copy-url', label: m.menu_copy_url(), icon: LinkIcon },
  { id: 'refetch-link', label: m.menu_refetch_link(), icon: RefreshCw },
  { id: 'edit-url', label: 'Edit URL', icon: LinkIcon },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  lockItem(locked),
  { id: 'detach-from-canvas', label: m.menu_move_to_library(), icon: BookOpen },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const MOVE_TO_VIEW_ACTION_PREFIX = 'move-to-view:';

const getMultiItems = (
  views: ViewSummary[],
  activeViewId: string,
  allLocked: boolean
): MenuItem[] => {
  const targetViews = views.filter((view) => view.id !== activeViewId);
  return [
    {
      id: 'duplicate',
      label: m.menu_duplicate(),
      icon: CopyPlus,
      shortcut: '⌘D',
    },
    // 'group-selection' (not 'group') — the bare id would be picked up by
    // resolveCreatableKind and create a new empty group node instead.
    {
      id: 'group-selection',
      label: m.menu_group(),
      icon: Group,
      shortcut: '⌘G',
    },
    {
      id: 'ai-summarize',
      label: m.menu_ai_summarize(),
      icon: Sparkles,
    },
    { id: 'change-color', label: m.menu_change_color(), icon: Palette },
    { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
    {
      id: 'toggle-lock-selection',
      label: allLocked ? m.menu_unlock() : m.menu_lock(),
      icon: allLocked ? Unlock : Lock,
    },
    {
      id: 'move-to-view',
      label: m.menu_move_to_view(),
      icon: Layers,
      disabled: targetViews.length === 0,
      submenu:
        targetViews.length > 0
          ? targetViews.map((view) => ({
              id: `${MOVE_TO_VIEW_ACTION_PREFIX}${view.id}`,
              label: view.name,
              icon: Layers,
            }))
          : undefined,
    },
    { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
    {
      id: 'delete',
      label: m.menu_delete(),
      icon: Trash2,
      shortcut: '⌫',
      danger: true,
    },
  ];
};

const getAssetItems = (locked: boolean): MenuItem[] => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  {
    id: 'reveal-in-finder',
    label: m.menu_reveal_in_finder(),
    icon: FolderOpen,
  },
  { id: 'replace-file', label: m.menu_replace_file(), icon: FilePlus },
  { id: 'rename-asset', label: m.menu_rename_asset(), icon: PenLine },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  lockItem(locked),
  { id: 'detach-from-canvas', label: m.menu_move_to_library(), icon: BookOpen },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

/** Widgets edit in place on the canvas — no focused/note view. */
const getWidgetItems = (locked: boolean): MenuItem[] => [
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  lockItem(locked),
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const EXTENSION_HOST_MENU_ITEMS: Record<
  HostGenericMenuActionId,
  (locked: boolean) => MenuItem
> = {
  focus: () => ({
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  }),
  copy: () => ({
    id: 'copy',
    label: m.menu_copy(),
    icon: Copy,
    shortcut: '⌘C',
  }),
  'change-color': () => ({
    id: 'change-color',
    label: m.menu_change_color(),
    icon: Palette,
  }),
  'edit-tag': () => ({
    id: 'edit-tag',
    label: m.menu_edit_tag(),
    icon: Tag,
  }),
  'toggle-lock': (locked) => lockItem(locked),
  'detach-from-canvas': () => ({
    id: 'detach-from-canvas',
    label: m.menu_move_to_library(),
    icon: BookOpen,
  }),
  delete: () => ({
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  }),
};

function getExtensionItems(
  locked: boolean,
  assembled: AssembledExtensionMenuItem[]
): MenuItem[] {
  return assembled.map((item) => {
    if (item.source === 'host') {
      return EXTENSION_HOST_MENU_ITEMS[item.id](locked);
    }
    return {
      id: item.id,
      label: resolveExtensionMessage(item.labelKey),
      icon: item.icon,
      ...(item.danger ? { danger: true } : {}),
    };
  });
}

const getRecordingItems = (locked: boolean): MenuItem[] => [
  {
    id: 'reveal-in-finder',
    label: m.menu_reveal_in_finder(),
    icon: FolderOpen,
  },
  { id: 'rename-asset', label: m.menu_rename_asset(), icon: PenLine },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  lockItem(locked),
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

type EdgePathType = 'smoothstep' | 'bezier';

const getEdgeItems = (
  pathType: EdgePathType,
  isTreeEdge: boolean
): MenuItem[] => {
  if (isTreeEdge) {
    // A Topic tree relation has no label, animation, path type, or colour of
    // its own, and removing it re-parents a branch rather than deleting a
    // line, so none of the generic edge actions apply.
    return [];
  }
  return [
    { id: 'edit-edge-label', label: m.menu_edit_label(), icon: Tag },
    {
      id: 'toggle-edge-animated',
      label: m.menu_toggle_animation(),
      icon: Sparkles,
    },
    {
      id: 'toggle-edge-path-type',
      label:
        pathType === 'bezier'
          ? m.menu_toggle_straight()
          : m.menu_toggle_curved(),
      icon: Spline,
    },
    { id: 'cycle-edge-color', label: m.menu_edge_color(), icon: Palette },
    {
      id: 'delete-edge',
      label: m.menu_delete_edge(),
      icon: Trash2,
      danger: true,
    },
  ];
};

export type { ContextMenuState };

// This component owns keyboard roving, submenu state, and menu rendering together.
// react-doctor-disable-next-line react-doctor/no-giant-component
export function CanvasContextMenu({
  menu,
  onClose,
  onAction,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  onAction: (action: string, nodeId?: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const submenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndexRef = useRef(0);
  const submenuActiveIndexRef = useRef(0);
  const menuKey = menu
    ? [
        menu.target,
        menu.nodeId ?? '',
        menu.edgeId ?? '',
        menu.folderId ?? '',
        Math.round(menu.x),
        Math.round(menu.y),
      ].join(':')
    : null;
  const [submenuState, setSubmenuState] = useState<{
    menuKey: string | null;
    openSubmenu: string | null;
  }>(() => ({
    menuKey,
    openSubmenu: null,
  }));
  if (submenuState.menuKey !== menuKey) {
    setSubmenuState({ menuKey, openSubmenu: null });
  }
  const openSubmenu =
    submenuState.menuKey === menuKey ? submenuState.openSubmenu : null;
  const setOpenSubmenu = useCallback(
    (next: SetStateAction<string | null>) => {
      setSubmenuState((current) => {
        const currentOpen =
          current.menuKey === menuKey ? current.openSubmenu : null;
        return {
          menuKey,
          openSubmenu: typeof next === 'function' ? next(currentOpen) : next,
        };
      });
    },
    [menuKey]
  );
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusFrameRef = useRef<number | null>(null);
  const edgePathType = useCanvasStore((state) => {
    if (menu?.target !== 'edge' || !menu.edgeId) {
      return 'bezier';
    }

    const edge = state.edges.find((item) => item.id === menu.edgeId);
    const pathType = (edge?.data as { pathType?: unknown } | undefined)
      ?.pathType;
    return pathType === 'smoothstep' ? 'smoothstep' : 'bezier';
  });
  const hasTopics = useCanvasStore((state) =>
    menu?.target === 'canvas'
      ? state.nodes.some((node) => isTopicNodeType(node.type))
      : false
  );
  const topicHasParent = useCanvasStore((state) => {
    if (menu?.target !== 'topic' || !menu.nodeId) {
      return false;
    }
    return buildTopicIndex(state.nodes, state.edges).parentByChild.has(
      menu.nodeId
    );
  });
  const edgeIsTreeEdge = useCanvasStore((state) => {
    if (menu?.target !== 'edge' || !menu.edgeId) {
      return false;
    }
    const edge = state.edges.find((item) => item.id === menu.edgeId);
    return Boolean(edge && isTopicTreeEdge(edge));
  });
  const nodeLocked = useCanvasStore((state) => {
    if (!menu?.nodeId) {
      return false;
    }
    const node = state.nodes.find((item) => item.id === menu.nodeId);
    return Boolean((node?.data as { locked?: unknown } | undefined)?.locked);
  });
  const hasClipboard = useCanvasStore((state) => state.clipboard.length > 0);
  const activeViewId = useCanvasStore((state) => state.activeViewId);
  const views = useCanvasStore((state) => state.views);
  const allSelectedLocked = useCanvasStore((state) => {
    if (menu?.target !== 'multi') {
      return false;
    }
    const selected = state.nodes.filter((node) => node.selected);
    return (
      selected.length > 0 &&
      selected.every((node) =>
        Boolean((node.data as { locked?: unknown } | undefined)?.locked)
      )
    );
  });
  const extensionCanvasTypeId = useCanvasStore((state) => {
    if (menu?.target !== 'extension' || !menu.nodeId) {
      return;
    }
    return resolveExtensionNodeRef(state.nodes, menu.nodeId, menu.folderId)
      ?.canvasTypeId;
  });
  const extensionInstanceId = useCanvasStore((state) => {
    if (menu?.target !== 'extension' || !menu.nodeId) {
      return;
    }
    return resolveExtensionNodeRef(state.nodes, menu.nodeId, menu.folderId)
      ?.instanceId;
  });
  const extensionInstanceState = useExtensionInstanceStore((state) => {
    if (!extensionInstanceId) {
      return;
    }
    const record = state.records[extensionInstanceId];
    if (!record || isExtensionInstanceLoadError(record)) {
      return;
    }
    return record.state;
  });
  const extensionMenuItems = assembleExtensionMenuItems({
    canvasType: extensionCanvasTypeId
      ? canvasTypeRegistry.get(extensionCanvasTypeId)
      : undefined,
    state: extensionInstanceState,
  });

  const itemGetters: Record<string, () => MenuItem[]> = {
    edge: () => getEdgeItems(edgePathType, edgeIsTreeEdge),
    'folder-child': getFolderChildItems,
    folder: () => getFolderItems(nodeLocked),
    group: () => getGroupItems(nodeLocked),
    sticky: () => getStickyItems(nodeLocked),
    topic: () => getTopicItems(nodeLocked, topicHasParent),
    image: () => getImageItems(nodeLocked),
    link: () => getLinkItems(nodeLocked),
    asset: () => getAssetItems(nodeLocked),
    recording: () => getRecordingItems(nodeLocked),
    widget: () => getWidgetItems(nodeLocked),
    extension: () => getExtensionItems(nodeLocked, extensionMenuItems),
    card: () => getCardItems(nodeLocked),
    multi: () => getMultiItems(views, activeViewId, allSelectedLocked),
    canvas: () => getCanvasItems(hasClipboard, hasTopics),
  };

  const baseItems = menu
    ? (
        itemGetters[menu.target] ??
        (() => getCanvasItems(hasClipboard, hasTopics))
      )()
    : [];
  const items = menu?.folderId
    ? getExpandedFolderChildItems(baseItems)
    : baseItems;
  const submenuItems = openSubmenu
    ? items.find((item) => item.id === openSubmenu)?.submenu
    : undefined;

  const focusItem = useCallback(
    (index: number) => {
      if (items.length === 0) {
        return;
      }
      const next = (index + items.length) % items.length;
      activeIndexRef.current = next;
      itemRefs.current[next]?.focus();
    },
    [items.length]
  );

  const focusSubmenuItem = useCallback(
    (index: number) => {
      if (!submenuItems || submenuItems.length === 0) {
        return;
      }
      const next = (index + submenuItems.length) % submenuItems.length;
      submenuActiveIndexRef.current = next;
      submenuItemRefs.current[next]?.focus();
    },
    [submenuItems]
  );

  const openSubmenuFor = useCallback(
    (id: string) => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setOpenSubmenu(id);
      submenuActiveIndexRef.current = 0;
    },
    [setOpenSubmenu]
  );

  const scheduleCloseSubmenu = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setOpenSubmenu(null);
      closeTimerRef.current = null;
    }, 100);
  }, [setOpenSubmenu]);

  const cancelCloseSubmenu = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleSubmenuFocus = useCallback(
    (index: number) => {
      if (focusFrameRef.current !== null) {
        cancelAnimationFrame(focusFrameRef.current);
      }
      focusFrameRef.current = requestAnimationFrame(() => {
        focusFrameRef.current = null;
        focusSubmenuItem(index);
      });
    },
    [focusSubmenuItem]
  );

  useEffect(
    () => () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (focusFrameRef.current !== null) {
        cancelAnimationFrame(focusFrameRef.current);
        focusFrameRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (!menu) {
      return;
    }
    activeIndexRef.current = 0;
    itemRefs.current[0]?.focus();
  }, [menu]);

  const handleDocumentPointerDown = useEffectEvent((e: PointerEvent) => {
    const button = e.button ?? 0;
    if (button !== 0) {
      return;
    }
    const target = e.target as HTMLElement;
    const inMenu = ref.current?.contains(target) ?? false;
    const inSubmenu = submenuRef.current?.contains(target) ?? false;
    if (!(inMenu || inSubmenu)) {
      onClose();
    }
  });

  const handleDocumentKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (openSubmenu) {
        e.preventDefault();
        setOpenSubmenu(null);
        itemRefs.current[activeIndexRef.current]?.focus();
        return;
      }
      onClose();
      return;
    }
    if (openSubmenu && submenuItems) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusSubmenuItem(submenuActiveIndexRef.current + 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusSubmenuItem(submenuActiveIndexRef.current - 1);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setOpenSubmenu(null);
        itemRefs.current[activeIndexRef.current]?.focus();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const active = document.activeElement;
        const index = submenuItemRefs.current.indexOf(
          active as HTMLButtonElement
        );
        if (index !== -1) {
          e.preventDefault();
          const item = submenuItems[index];
          if (item) {
            onAction(item.id, menu?.nodeId ?? menu?.edgeId);
            onClose();
          }
        }
        return;
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(activeIndexRef.current + 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(activeIndexRef.current - 1);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      focusItem(items.length - 1);
      return;
    }
    if (e.key === 'ArrowRight') {
      const activeItem = items[activeIndexRef.current];
      if (activeItem?.submenu) {
        e.preventDefault();
        openSubmenuFor(activeItem.id);
        scheduleSubmenuFocus(0);
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      const active = document.activeElement;
      const index = itemRefs.current.indexOf(active as HTMLButtonElement);
      if (index !== -1) {
        e.preventDefault();
        const item = items[index];
        if (item && !item.disabled) {
          if (item.submenu) {
            openSubmenuFor(item.id);
            scheduleSubmenuFocus(0);
          } else {
            onAction(item.id, menu?.nodeId ?? menu?.edgeId);
            onClose();
          }
        }
      }
    }
  });

  useEffect(() => {
    if (!menu) {
      return;
    }

    const handleClick = (e: PointerEvent) => {
      handleDocumentPointerDown(e);
    };
    const handleKey = (e: KeyboardEvent) => {
      handleDocumentKeyDown(e);
    };
    document.addEventListener('pointerdown', handleClick, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleClick, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu]);

  const [menuPosition, setMenuPosition] = useState(() =>
    menu ? clampMenuPosition(menu.x, menu.y, 220, 40) : { x: 0, y: 0 }
  );

  useLayoutEffect(() => {
    if (!menu) {
      return;
    }
    const updatePosition = () => {
      const rect = ref.current?.getBoundingClientRect();
      const width = rect && rect.width > 0 ? rect.width : 220;
      const height =
        rect && rect.height > 0 ? rect.height : Math.max(items.length, 1) * 40;
      setMenuPosition(clampMenuPosition(menu.x, menu.y, width, height));
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
    };
  }, [items.length, menu]);

  const x = menuPosition.x;
  const y = menuPosition.y;

  const submenuParentIndex = openSubmenu
    ? items.findIndex((item) => item.id === openSubmenu)
    : -1;
  const submenuParentEl =
    submenuParentIndex >= 0 ? itemRefs.current[submenuParentIndex] : null;
  const submenuWidth = 180;
  const parentRect = submenuParentEl?.getBoundingClientRect();
  const submenuOpensRight = parentRect
    ? parentRect.right + submenuWidth + 8 <= window.innerWidth
    : true;
  const submenuX = parentRect
    ? submenuOpensRight
      ? parentRect.right + 4
      : parentRect.left - submenuWidth - 4
    : 0;
  const submenuY = parentRect
    ? Math.max(
        8,
        Math.min(
          parentRect.top,
          window.innerHeight - (submenuItems?.length ?? 0) * 40 - 16
        )
      )
    : 0;

  return (
    <AnimatePresence>
      {menu ? (
        <>
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-label="Canvas context menu"
            className="fixed z-100 min-w-[200px] overflow-hidden rounded-xl border border-black/5 bg-white/95 py-1 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-800/90"
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            ref={ref}
            role="menu"
            style={{ left: x, top: y }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
          >
            {items.map((item, index) => (
              <button
                aria-disabled={item.disabled || undefined}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 font-medium text-[13px] transition-colors focus-visible:outline-hidden',
                  item.disabled
                    ? 'cursor-default text-gray-300 dark:text-gray-600'
                    : item.danger
                      ? 'text-red-600 hover:bg-red-50 focus-visible:bg-red-50 dark:text-red-400 dark:focus-visible:bg-red-900/30 dark:hover:bg-red-900/30'
                      : 'text-gray-700 hover:bg-black/5 focus-visible:bg-black/5 dark:text-gray-200 dark:focus-visible:bg-white/5 dark:hover:bg-white/5',
                  !item.disabled && openSubmenu === item.id
                    ? 'bg-black/5 dark:bg-white/5'
                    : ''
                )}
                key={item.id}
                onClick={() => {
                  if (item.disabled) {
                    return;
                  }
                  if (item.submenu) {
                    return;
                  }
                  onAction(item.id, menu.nodeId ?? menu.edgeId);
                  onClose();
                }}
                onMouseEnter={() => {
                  if (item.disabled) {
                    return;
                  }
                  activeIndexRef.current = index;
                  if (item.submenu) {
                    openSubmenuFor(item.id);
                  } else if (openSubmenu) {
                    scheduleCloseSubmenu();
                  }
                }}
                onMouseLeave={() => {
                  if (item.submenu) {
                    scheduleCloseSubmenu();
                  }
                }}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
              >
                <item.icon
                  className={
                    item.disabled
                      ? 'text-gray-300 dark:text-gray-600'
                      : item.danger
                        ? 'text-red-500 dark:text-red-400'
                        : 'text-gray-400 dark:text-gray-500'
                  }
                  size={15}
                />
                <span className="flex-1 text-left">{item.label}</span>
                {item.submenu ? (
                  <ChevronRight
                    className="text-gray-400 dark:text-gray-500"
                    size={14}
                  />
                ) : item.shortcut ? (
                  <span className="text-2xs text-gray-400 dark:text-gray-500">
                    {item.shortcut}
                  </span>
                ) : null}
              </button>
            ))}
          </motion.div>

          <AnimatePresence>
            {openSubmenu && submenuItems ? (
              <motion.div
                animate={{ opacity: 1, scale: 1, x: 0 }}
                aria-label="New item submenu"
                className="fixed z-101 min-w-[180px] overflow-y-auto rounded-xl border border-black/5 bg-white/95 py-1 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-800/90"
                exit={{ opacity: 0, scale: 0.95, x: -4 }}
                initial={{ opacity: 0, scale: 0.95, x: -4 }}
                onMouseEnter={cancelCloseSubmenu}
                onMouseLeave={scheduleCloseSubmenu}
                ref={submenuRef}
                role="menu"
                style={{
                  left: submenuX,
                  maxHeight: 'calc(100vh - 16px)',
                  top: submenuY,
                }}
                transition={{ type: 'spring', damping: 25, stiffness: 400 }}
              >
                {submenuItems.map((subItem, subIndex) => (
                  <button
                    className="flex w-full items-center gap-3 px-3 py-2 font-medium text-[13px] text-gray-700 transition-colors hover:bg-black/5 focus-visible:bg-black/5 focus-visible:outline-hidden dark:text-gray-200 dark:focus-visible:bg-white/5 dark:hover:bg-white/5"
                    key={subItem.id}
                    onClick={() => {
                      onAction(subItem.id, menu.nodeId ?? menu.edgeId);
                      onClose();
                    }}
                    onMouseEnter={() => {
                      submenuActiveIndexRef.current = subIndex;
                    }}
                    ref={(element) => {
                      submenuItemRefs.current[subIndex] = element;
                    }}
                    type="button"
                  >
                    <subItem.icon
                      className="text-gray-400 dark:text-gray-500"
                      size={15}
                    />
                    <span className="flex-1 text-left">{subItem.label}</span>
                  </button>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : null}
    </AnimatePresence>
  );
}
