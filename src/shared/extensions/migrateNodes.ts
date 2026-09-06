import { EXTENSION_NODE_TYPE } from './ids';

export interface ExtensionNodeRef {
  canvasTypeId: string;
  instanceId: string;
}

export function extensionNodeData(
  canvasTypeId: string,
  instanceId: string
): ExtensionNodeRef {
  return { canvasTypeId, instanceId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function persistableExtensionData(
  node: Record<string, unknown>,
  canvasTypeId: string,
  instanceId: string
): ExtensionNodeRef & { detached?: true } {
  const data = isRecord(node.data) ? node.data : {};
  return {
    ...extensionNodeData(canvasTypeId, instanceId),
    ...(data.detached === true ? { detached: true as const } : {}),
  };
}

export function rewriteToExtensionNode<T extends Record<string, unknown>>(
  node: T,
  canvasTypeId: string,
  instanceId: string
): T {
  return {
    ...node,
    type: EXTENSION_NODE_TYPE,
    data: persistableExtensionData(node, canvasTypeId, instanceId),
  };
}

/** Persist the extension reference plus host flags such as `detached`. */
export function persistableExtensionNode(
  node: Record<string, unknown>,
  canvasTypeId: string,
  instanceId: string
): Record<string, unknown> {
  return {
    ...node,
    type: EXTENSION_NODE_TYPE,
    data: persistableExtensionData(node, canvasTypeId, instanceId),
  };
}

export function readWidgetId(data: unknown): string | undefined {
  if (!isRecord(data)) {
    return;
  }
  return typeof data.widgetId === 'string' && data.widgetId
    ? data.widgetId
    : undefined;
}

export function readWidgetKind(data: unknown): string | undefined {
  if (!isRecord(data)) {
    return;
  }
  return typeof data.kind === 'string' ? data.kind : undefined;
}
