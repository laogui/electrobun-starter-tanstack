import { EXTENSION_NODE_TYPE, isInstanceId } from './ids';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readInstanceId(data: unknown): string | undefined {
  const record = asRecord(data);
  const instanceId = record?.instanceId;
  return typeof instanceId === 'string' && isInstanceId(instanceId)
    ? instanceId
    : undefined;
}

/** Collect instance ids from top-level nodes and folder children. */
export function collectExtensionInstanceIds(
  nodes: readonly unknown[]
): string[] {
  const ids = new Set<string>();

  for (const rawNode of nodes) {
    const node = asRecord(rawNode);
    if (!node) {
      continue;
    }
    if (node.type === EXTENSION_NODE_TYPE) {
      const id = readInstanceId(node.data);
      if (id) {
        ids.add(id);
      }
    }
    if (node.type !== 'folder') {
      continue;
    }
    const data = asRecord(node.data);
    const children = data?.children;
    if (!Array.isArray(children)) {
      continue;
    }
    for (const rawChild of children) {
      const child = asRecord(rawChild);
      if (child?.type !== EXTENSION_NODE_TYPE) {
        continue;
      }
      const id = readInstanceId(child.data);
      if (id) {
        ids.add(id);
      }
    }
  }

  return [...ids];
}
