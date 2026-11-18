/**
 * Shared class strings for floating menus (Base UI `Menu` popups on the
 * bottom bar and the canvas context menu). Keeps every menu on one compact
 * macOS-style rhythm: an inset popup with padding, rounded highlight rows,
 * 13px labels, and muted 15px icons — no per-row divider lines.
 */

/** Popup surface. Pair with `floating-menu-popup` for the grow-in motion. */
export const MENU_POPUP =
  'overflow-hidden rounded-xl border border-black/5 bg-white/95 p-1 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-800/95';

/** A single row. Highlight comes from Base UI's `data-highlighted`. */
export const MENU_ITEM =
  'flex w-full cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left font-medium text-[13px] text-gray-700 outline-hidden transition-colors data-highlighted:bg-black/5 data-disabled:cursor-not-allowed data-disabled:text-gray-300 dark:text-gray-200 dark:data-highlighted:bg-white/10 dark:data-disabled:text-gray-600';

/** Leading icon tone for `MENU_ITEM` rows (render lucide icons at size 15). */
export const MENU_ITEM_ICON = 'shrink-0 text-gray-400 dark:text-gray-500';

export const MENU_ICON_SIZE = 15;

/** Small uppercase group label inside a menu. */
export const MENU_SECTION_LABEL =
  'px-2.5 pt-2 pb-1 font-medium text-2xs text-gray-400 uppercase tracking-wide dark:text-gray-500';

/** Hairline between groups. */
export const MENU_SEPARATOR = 'mx-1 my-1 h-px bg-black/5 dark:bg-white/10';
