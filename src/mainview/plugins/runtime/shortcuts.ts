export interface Shortcut {
  alt: boolean;
  ctrl: boolean;
  key: string;
  meta: boolean;
  mod: boolean;
  shift: boolean;
  signature: string;
}

const HOST_MOD_KEYS = new Set([
  'a',
  'c',
  'd',
  'f',
  'g',
  'k',
  'n',
  'v',
  'x',
  'z',
  '=',
  '+',
  '-',
  '0',
]);
const HOST_KEYS = new Set([
  'escape',
  'delete',
  'backspace',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'enter',
  'tab',
  ' ',
]);

export function parseShortcut(value: string): Shortcut {
  const parts = value
    .toLowerCase()
    .split('+')
    .map((part) => part.trim());
  const key = parts.pop();
  const modifiers = new Set(parts);
  if (
    !key ||
    parts.some(
      (part) => !['mod', 'meta', 'ctrl', 'alt', 'shift'].includes(part)
    ) ||
    modifiers.size !== parts.length
  ) {
    throw new Error(`Invalid shortcut: ${value}`);
  }
  const shortcut = {
    key,
    mod: modifiers.has('mod'),
    meta: modifiers.has('meta'),
    ctrl: modifiers.has('ctrl'),
    alt: modifiers.has('alt'),
    shift: modifiers.has('shift'),
    signature: '',
  };
  if (shortcut.mod && (shortcut.meta || shortcut.ctrl)) {
    throw new Error(`Use Mod or an explicit modifier, not both: ${value}`);
  }
  if (
    HOST_KEYS.has(key) ||
    (!(shortcut.mod || shortcut.meta || shortcut.ctrl || shortcut.alt) &&
      key.length === 1) ||
    ((shortcut.mod || shortcut.meta || shortcut.ctrl) && HOST_MOD_KEYS.has(key))
  ) {
    throw new Error(`Shortcut reserved by host: ${value}`);
  }
  shortcut.signature = [...parts.sort(), key].join('+');
  return shortcut;
}

export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: Shortcut
): boolean {
  const primary = shortcut.mod
    ? (event.metaKey || event.ctrlKey) && !(event.metaKey && event.ctrlKey)
    : event.metaKey === shortcut.meta && event.ctrlKey === shortcut.ctrl;
  return (
    primary &&
    event.altKey === shortcut.alt &&
    event.shiftKey === shortcut.shift &&
    event.key.toLowerCase() === shortcut.key
  );
}

export function isEditingShortcut(event: KeyboardEvent): boolean {
  const targets = [
    event.target,
    ...event.composedPath(),
    document.activeElement,
  ];
  return targets.some(
    (target) =>
      target instanceof Element &&
      Boolean(
        target.closest(
          'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'
        )
      )
  );
}
