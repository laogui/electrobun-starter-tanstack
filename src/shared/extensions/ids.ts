/** Shared canvas-type and instance identifiers. No Bun or DOM imports. */

export const EXTENSION_NODE_TYPE = 'extension' as const;

export const INSTANCE_ID_PREFIX = 'extinst_';

/** `<namespace>/<typeId>` — namespace is dotted kebab-case; typeId is kebab-case. */
export const CANVAS_TYPE_ID_RE =
  /^([a-z][a-z0-9-]{0,31}(?:\.[a-z][a-z0-9-]{0,31})+)\/([a-z][a-z0-9-]{0,63})$/;

export const INSTANCE_ID_RE = /^extinst_[A-Za-z0-9_-]+$/;

const NEW_ACTION_PREFIX = /^new-/;

export interface ParsedCanvasTypeId {
  namespace: string;
  typeId: string;
}

export function isCanvasTypeId(value: string): boolean {
  return CANVAS_TYPE_ID_RE.test(value);
}

export function parseCanvasTypeId(value: string): ParsedCanvasTypeId | null {
  const match = CANVAS_TYPE_ID_RE.exec(value);
  if (!match) {
    return null;
  }
  return {
    namespace: match[1] as string,
    typeId: match[2] as string,
  };
}

export function isInstanceId(value: string): boolean {
  return INSTANCE_ID_RE.test(value);
}

export function generateInstanceId(): string {
  return `${INSTANCE_ID_PREFIX}${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

export function canvasTypeMenuActionId(canvasTypeId: string): string {
  return `ext:${canvasTypeId}`;
}

export function parseCanvasTypeMenuActionId(
  actionId: string
): string | undefined {
  const canonical = actionId.replace(NEW_ACTION_PREFIX, '');
  if (!canonical.startsWith('ext:')) {
    return;
  }
  const canvasTypeId = canonical.slice('ext:'.length);
  return isCanvasTypeId(canvasTypeId) ? canvasTypeId : undefined;
}
