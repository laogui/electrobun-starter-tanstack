import { INSTANCE_ID_PREFIX, isInstanceId } from './ids';

/** Per-type kill switches so a broken migrator can be paused independently. */
export const LEGACY_MIGRATION_ENABLED = {
  asset: true,
  image: true,
  link: true,
  recording: true,
  widget: true,
} as const;

export function instanceIdFromWidgetId(widgetId: string): string {
  return `${INSTANCE_ID_PREFIX}${widgetId}`;
}

/**
 * Portable 16-char hex so renderer tests and Bun share the same ids.
 * Not cryptographic; only needs to be stable and collision-resistant enough
 * for viewId + nodeId + type (+ child path) tuples.
 */
export function stableHex(input: string): string {
  let h1 = 2_166_137_261;
  let h2 = 5381;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    // biome-ignore lint/suspicious/noBitwiseOperators: FNV-style hash
    h1 ^= code;
    h1 = Math.imul(h1, 16_777_619);
    // biome-ignore lint/suspicious/noBitwiseOperators: FNV-style hash
    h2 = (Math.imul(h2, 33) ^ code) >>> 0;
  }
  return `${
    // biome-ignore lint/suspicious/noBitwiseOperators: unsigned 32-bit
    (h1 >>> 0).toString(16).padStart(8, '0')
  }${
    // biome-ignore lint/suspicious/noBitwiseOperators: unsigned 32-bit
    (h2 >>> 0).toString(16).padStart(8, '0')
  }`;
}

export function instanceIdFromInlineNode(input: {
  childPath?: string;
  nodeId: string;
  type: string;
  viewId: string;
}): string {
  const id = `${INSTANCE_ID_PREFIX}${stableHex(
    [input.viewId, input.nodeId, input.type, input.childPath ?? ''].join('\0')
  )}`;
  return isInstanceId(id) ? id : `${INSTANCE_ID_PREFIX}migrated`;
}
