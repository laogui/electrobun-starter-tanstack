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
export const CREATABLE_KIND_BY_ACTION = {
  note: 'card',
  checklist: 'checklist',
  sticky: 'sticky',
  image: 'image',
  link: 'link',
  folder: 'folder',
  group: 'group',
  file: 'asset',
} as const satisfies Record<string, CreatableCanvasNodeKind>;

/** Canonical (prefix-free) creation action id. */
export type CreateActionId = keyof typeof CREATABLE_KIND_BY_ACTION;

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
