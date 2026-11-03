export interface RecoveryGraph {
  edges: Array<{ id: string; source: string; target: string }>;
  nodes: Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
    position: { x: number; y: number };
  }>;
}
export interface DiskRecoveryBackup {
  file: string;
  graph: RecoveryGraph;
  name: string;
  savedAt: number;
  viewId: string;
}

/** Restore only complete graph records; raw damaged evidence can still be exported. */
export function isRecoveryGraph(value: unknown): value is RecoveryGraph {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const graph = value as RecoveryGraph;
  if (!(Array.isArray(graph.nodes) && Array.isArray(graph.edges))) {
    return false;
  }
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (
      !node ||
      typeof node.id !== 'string' ||
      !node.id ||
      ids.has(node.id) ||
      typeof node.type !== 'string' ||
      !node.data ||
      typeof node.data !== 'object' ||
      Array.isArray(node.data) ||
      !Number.isFinite(node.position?.x) ||
      !Number.isFinite(node.position?.y)
    ) {
      return false;
    }
    ids.add(node.id);
  }
  const edgeIds = new Set<string>();
  return graph.edges.every((edge) => {
    if (
      !edge ||
      typeof edge.id !== 'string' ||
      edgeIds.has(edge.id) ||
      !ids.has(edge.source) ||
      !ids.has(edge.target)
    ) {
      return false;
    }
    edgeIds.add(edge.id);
    return true;
  });
}

export function compareRecoveryGraphs(
  current: RecoveryGraph,
  backup: RecoveryGraph
) {
  const before = new Map(current.nodes.map((node) => [node.id, node]));
  const after = new Map(backup.nodes.map((node) => [node.id, node]));
  return {
    added: backup.nodes.filter((node) => !before.has(node.id)),
    removed: current.nodes.filter((node) => !after.has(node.id)),
    changed: backup.nodes.filter(
      (node) =>
        before.has(node.id) &&
        JSON.stringify(before.get(node.id)) !== JSON.stringify(node)
    ),
  };
}
