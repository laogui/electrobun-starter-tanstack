import type { Edge, Node } from '@xyflow/react';
import { nanoid } from 'nanoid';
import type { CanvasExportDocument } from '@/lib/canvasExport';
import { sortNodesByParent } from '@/lib/canvasUtils';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readCanvasPoint(value: unknown): { x: number; y: number } {
  if (!isRecord(value)) {
    return { x: 0, y: 0 };
  }
  const { x, y } = value;
  return {
    x: typeof x === 'number' && Number.isFinite(x) ? x : 0,
    y: typeof y === 'number' && Number.isFinite(y) ? y : 0,
  };
}

function uniqueImportedId(prefix: string, usedIds: Set<string>): string {
  let id = `${prefix}-${nanoid(8)}`;
  while (usedIds.has(id)) {
    id = `${prefix}-${nanoid(8)}`;
  }
  usedIds.add(id);
  return id;
}

function collectWidgetIdsFromImportedData(
  type: unknown,
  data: unknown,
  ids: Set<string>
): void {
  if (!isRecord(data)) {
    return;
  }
  if (type === 'widget') {
    const widgetId = data.widgetId;
    if (typeof widgetId === 'string' && widgetId) {
      ids.add(widgetId);
    }
    return;
  }
  if (type !== 'folder') {
    return;
  }
  const children = data.children;
  if (!Array.isArray(children)) {
    return;
  }
  for (const child of children) {
    if (!isRecord(child)) {
      continue;
    }
    collectWidgetIdsFromImportedData(child.type, child.data, ids);
  }
}

export function collectWidgetIdsFromCanvasExport(
  document_: CanvasExportDocument
): string[] {
  const ids = new Set<string>();
  for (const node of document_.nodes) {
    if (!isRecord(node)) {
      continue;
    }
    collectWidgetIdsFromImportedData(node.type, node.data, ids);
  }
  return [...ids];
}

function collectInstanceIdsFromImportedData(
  type: unknown,
  data: unknown,
  ids: Set<string>
): void {
  if (!isRecord(data)) {
    return;
  }
  if (type === 'extension') {
    const instanceId = data.instanceId;
    if (typeof instanceId === 'string' && instanceId) {
      ids.add(instanceId);
    }
    return;
  }
  if (type !== 'folder' || !Array.isArray(data.children)) {
    return;
  }
  for (const child of data.children) {
    if (!isRecord(child)) {
      continue;
    }
    collectInstanceIdsFromImportedData(child.type, child.data, ids);
  }
}

export function collectExtensionInstanceIdsFromCanvasExport(
  document_: CanvasExportDocument
): string[] {
  const ids = new Set<string>();
  for (const node of document_.nodes) {
    if (!isRecord(node)) {
      continue;
    }
    collectInstanceIdsFromImportedData(node.type, node.data, ids);
  }
  return [...ids];
}

/**
 * Remap widget ids on imported data using the resolved id map. Widget nodes /
 * folder-child widgets whose id is NOT present in the map are dropped: the
 * caller must have materialized a local widget for every imported widget id, so
 * an unmapped id means the backing widget could not be created and we must not
 * import a node that points at a foreign or missing widget file.
 */
function remapImportedWidgetData(
  type: unknown,
  data: unknown,
  widgetIdMap: Map<string, string>
): { data: Record<string, unknown>; dropped: boolean } {
  if (!isRecord(data)) {
    return { data: {}, dropped: false };
  }

  if (type === 'widget') {
    const widgetId = data.widgetId;
    if (typeof widgetId !== 'string' || !widgetIdMap.has(widgetId)) {
      // Unmapped external widget id: signal the caller to drop this node/child.
      return { data: { ...data }, dropped: true };
    }
    return {
      data: { ...data, widgetId: widgetIdMap.get(widgetId) },
      dropped: false,
    };
  }

  if (type !== 'folder' || !Array.isArray(data.children)) {
    return { data: { ...data }, dropped: false };
  }

  const nextChildren = data.children
    .map((child) => {
      if (!isRecord(child)) {
        return { child, dropped: false };
      }
      const result = remapImportedWidgetData(
        child.type,
        child.data,
        widgetIdMap
      );
      return {
        child: { ...child, data: result.data },
        dropped: result.dropped,
      };
    })
    .filter((entry) => !entry.dropped)
    .map((entry) => entry.child);

  return { data: { ...data, children: nextChildren }, dropped: false };
}

function remapImportedExtensionData(
  type: unknown,
  data: unknown,
  instanceIdMap: Map<string, string>
): Record<string, unknown> {
  if (!isRecord(data)) {
    return {};
  }
  if (type === 'extension') {
    const instanceId = data.instanceId;
    if (typeof instanceId === 'string' && instanceIdMap.has(instanceId)) {
      return { ...data, instanceId: instanceIdMap.get(instanceId) };
    }
    return { ...data };
  }
  if (type !== 'folder' || !Array.isArray(data.children)) {
    return { ...data };
  }
  const nextChildren = data.children.map((child) => {
    if (!isRecord(child)) {
      return child;
    }
    return {
      ...child,
      data: remapImportedExtensionData(child.type, child.data, instanceIdMap),
    };
  });
  return { ...data, children: nextChildren };
}

/**
 * Build the imported nodes/edges payload from a canvas export document. Widget
 * nodes (top-level or nested in folder children) whose backing widget could not
 * be materialized are skipped entirely so the canvas never ends up with a node
 * referencing a foreign or missing widget id. Extension nodes are never dropped:
 * unknown or disabled types still import as fallback nodes.
 */
export function buildImportedCanvasPayload(
  document_: CanvasExportDocument,
  anchorCenter: { x: number; y: number },
  currentNodes: Node[],
  currentEdges: Edge[],
  widgetIdMap: Map<string, string>,
  instanceIdMap: Map<string, string> = new Map()
): { edges: Edge[]; nodes: Node[] } {
  const rawNodes = document_.nodes.filter(
    (node): node is Record<string, unknown> =>
      isRecord(node) && typeof node.id === 'string' && node.id.length > 0
  );
  const usedNodeIds = new Set(currentNodes.map((node) => node.id));
  const usedEdgeIds = new Set(currentEdges.map((edge) => edge.id));
  const nodeIdMap = new Map<string, string>();
  for (const node of rawNodes) {
    nodeIdMap.set(
      node.id as string,
      uniqueImportedId('import-node', usedNodeIds)
    );
  }

  const topLevelPositions = rawNodes
    .filter((node) => {
      const parentId = node.parentId;
      return !(typeof parentId === 'string' && nodeIdMap.has(parentId));
    })
    .map((node) => readCanvasPoint(node.position));
  const minX =
    topLevelPositions.length > 0
      ? Math.min(...topLevelPositions.map((point) => point.x))
      : 0;
  const minY =
    topLevelPositions.length > 0
      ? Math.min(...topLevelPositions.map((point) => point.y))
      : 0;
  const offset = { x: anchorCenter.x - minX, y: anchorCenter.y - minY };

  const nodes = rawNodes.flatMap((node) => {
    const {
      data: rawData,
      extent,
      id,
      parentId: rawParentId,
      position: rawPosition,
      ...rest
    } = node;
    const remapped = remapImportedWidgetData(node.type, rawData, widgetIdMap);
    if (remapped.dropped) {
      // Drop the node entirely so we never import an unmapped widget reference.
      // Its id mapping is left in place so edges pointing at it are dropped below.
      return [];
    }
    const remappedData = remapImportedExtensionData(
      node.type,
      remapped.data,
      instanceIdMap
    );
    const nextParentId =
      typeof rawParentId === 'string' ? nodeIdMap.get(rawParentId) : undefined;
    const position = readCanvasPoint(rawPosition);
    const nextPosition = nextParentId
      ? position
      : { x: position.x + offset.x, y: position.y + offset.y };

    return [
      {
        ...rest,
        id: nodeIdMap.get(id as string) as string,
        position: nextPosition,
        data: remappedData,
        selected: true,
        ...(nextParentId
          ? { parentId: nextParentId, extent: extent ?? 'parent' }
          : {}),
      } as Node,
    ];
  });

  const importedNodeIds = new Set(nodes.map((node) => node.id));
  const edges = document_.edges.flatMap((rawEdge) => {
    if (
      !(
        isRecord(rawEdge) &&
        typeof rawEdge.source === 'string' &&
        typeof rawEdge.target === 'string'
      )
    ) {
      return [];
    }
    const source = nodeIdMap.get(rawEdge.source);
    const target = nodeIdMap.get(rawEdge.target);
    if (!(source && target)) {
      return [];
    }
    // Drop edges that touch a skipped (dropped) widget node.
    if (!(importedNodeIds.has(source) && importedNodeIds.has(target))) {
      return [];
    }
    return [
      {
        ...rawEdge,
        id: uniqueImportedId('import-edge', usedEdgeIds),
        source,
        target,
        selected: false,
      } as Edge,
    ];
  });

  return { edges, nodes: sortNodesByParent(nodes) };
}
