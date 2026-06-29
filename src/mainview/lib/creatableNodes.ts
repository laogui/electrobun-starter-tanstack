import {
  File,
  Folder,
  Group,
  ImageIcon,
  Link as LinkIcon,
  ListChecks,
  Mic,
  NotebookPen,
  StickyNote,
} from 'lucide-react';
import type { ElementType } from 'react';
import * as m from '../../paraglide/messages.js';
import type { CreatableCanvasNodeKind } from './contentTypes';

/**
 * Single source of truth mapping a creation *action id* to the canvas node kind
 * it produces. Both node-creation entry points — the bottom create menu
 * (`ViewSwitcher`) and the canvas right-click menu (`useContextMenu`) — resolve
 * their menu items through this table instead of each maintaining a private
 * copy.
 *
 * Action ids are the canonical, prefix-free names (`note`, `checklist`, …). The
 * context menu historically prefixes its ids with `new-` (`new-note`); use
 * `resolveCreatableKind` so either spelling resolves to the same kind.
 */
const CREATABLE_KIND_BY_ACTION = {
  note: 'card',
  checklist: 'checklist',
  sticky: 'sticky',
  image: 'image',
  link: 'link',
  folder: 'folder',
  group: 'group',
  file: 'asset',
  recording: 'recording',
} as const satisfies Record<string, CreatableCanvasNodeKind>;

/** Canonical (prefix-free) creation action id. */
export type CreateActionId = keyof typeof CREATABLE_KIND_BY_ACTION;

export type CreatableMenuLabelStyle = 'short' | 'new';

export interface CreatableMenuItem {
  enabled: true;
  icon: ElementType;
  id: CreateActionId;
  label: string;
}

interface CreatableMenuDefinition {
  icon: ElementType;
  id: CreateActionId;
  labels: Record<CreatableMenuLabelStyle, () => string>;
}

const CREATABLE_MENU_DEFINITIONS: CreatableMenuDefinition[] = [
  {
    id: 'note',
    icon: StickyNote,
    labels: { short: () => m.menu_note(), new: () => m.menu_new_note() },
  },
  {
    id: 'checklist',
    icon: ListChecks,
    labels: {
      short: () => m.menu_checklist(),
      new: () => m.menu_new_checklist(),
    },
  },
  {
    id: 'sticky',
    icon: NotebookPen,
    labels: { short: () => m.menu_sticky(), new: () => m.menu_new_sticky() },
  },
  {
    id: 'image',
    icon: ImageIcon,
    labels: { short: () => m.menu_image(), new: () => m.menu_new_image() },
  },
  {
    id: 'link',
    icon: LinkIcon,
    labels: { short: () => m.menu_link(), new: () => m.menu_new_link() },
  },
  {
    id: 'folder',
    icon: Folder,
    labels: { short: () => m.menu_folder(), new: () => m.menu_new_folder() },
  },
  {
    id: 'group',
    icon: Group,
    labels: { short: () => m.menu_group(), new: () => m.menu_new_group() },
  },
  {
    id: 'file',
    icon: File,
    labels: { short: () => m.menu_file(), new: () => m.menu_new_file() },
  },
  {
    id: 'recording',
    icon: Mic,
    labels: {
      short: () => m.menu_recording(),
      new: () => m.menu_new_recording(),
    },
  },
];

export function getCreatableMenuItems(
  labelStyle: CreatableMenuLabelStyle
): CreatableMenuItem[] {
  return CREATABLE_MENU_DEFINITIONS.map((item) => ({
    enabled: true,
    icon: item.icon,
    id: item.id,
    label: item.labels[labelStyle](),
  }));
}

const NEW_ACTION_PREFIX = /^new-/;

/**
 * Resolve a menu item id to the node kind it creates, or `undefined` when the
 * id is not a node-creation action (e.g. `paste`, `reset-zoom`). Accepts both
 * the canonical id (`note`) and the context-menu `new-` prefixed form
 * (`new-note`).
 */
export function resolveCreatableKind(
  actionId: string
): CreatableCanvasNodeKind | undefined {
  const canonical = actionId.replace(NEW_ACTION_PREFIX, '');
  return CREATABLE_KIND_BY_ACTION[canonical as CreateActionId];
}

/**
 * A request to create a node from a menu/shortcut entry point. Shared by the
 * bottom create menu and the right-click menu so both feed the same creation
 * flow (which may open the link URL prompt or the asset file picker).
 */
export interface CanvasCreateRequest {
  /** Desired center of the new node in flow coords. */
  anchorCenter?: { x: number; y: number };
  /** Screen-space point used to anchor a follow-up prompt (e.g. link URL form). */
  screen?: { x: number; y: number };
}
