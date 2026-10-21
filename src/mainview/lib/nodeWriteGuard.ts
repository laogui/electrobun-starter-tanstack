import type { Node } from '@xyflow/react';

/**
 * Guards for "await, then write back to a node" flows (image attachment
 * saves, link unfurls, file replacement). Between the await and the write
 * the user may undo, delete the node, or replace its content; writing the
 * stale result would resurrect old data. Callers capture the fields their
 * write depends on before awaiting, then re-read the live store and only
 * apply the patch when the node still exists and those fields are unchanged.
 */

export interface NodeDataExpectation {
  /** Field values (by key) the async result was computed against. */
  fields: Record<string, unknown>;
  nodeId: string;
}

export interface NodeWriteStore {
  getState: () => {
    nodes: Node[];
    updateNodeData: (nodeId: string, updates: Record<string, unknown>) => void;
  };
}

export function findNodeData(
  nodes: readonly Node[],
  nodeId: string
): Record<string, unknown> | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    return null;
  }
  return (node.data ?? {}) as Record<string, unknown>;
}

/** Snapshot the given keys of a node's current data, or null if it is gone. */
export function captureNodeData(
  nodes: readonly Node[],
  nodeId: string,
  keys: readonly string[]
): NodeDataExpectation | null {
  const data = findNodeData(nodes, nodeId);
  if (!data) {
    return null;
  }
  const fields: Record<string, unknown> = {};
  for (const key of keys) {
    fields[key] = data[key];
  }
  return { nodeId, fields };
}

/** True when the node still exists and every expected field is unchanged. */
export function isNodeDataUnchanged(
  nodes: readonly Node[],
  expectation: NodeDataExpectation
): boolean {
  const data = findNodeData(nodes, expectation.nodeId);
  if (!data) {
    return false;
  }
  for (const [key, value] of Object.entries(expectation.fields)) {
    if (!Object.is(data[key], value)) {
      return false;
    }
  }
  return true;
}

/**
 * Re-read the live store and apply `patch` only when the expectation still
 * holds. Returns whether the write happened. When it does, the expectation's
 * fields are advanced to the patched values so a follow-up write in the same
 * flow can chain on the same expectation.
 */
export function applyIfNodeUnchanged(
  store: NodeWriteStore,
  expectation: NodeDataExpectation,
  patch: Record<string, unknown>
): boolean {
  const state = store.getState();
  if (!isNodeDataUnchanged(state.nodes, expectation)) {
    return false;
  }
  state.updateNodeData(expectation.nodeId, patch);
  for (const key of Object.keys(expectation.fields)) {
    if (key in patch) {
      expectation.fields[key] = patch[key];
    }
  }
  return true;
}
