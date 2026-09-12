import type { Node } from '@xyflow/react';
import { buildNewNodeSpec, CARD_H, CARD_W } from '@/lib/canvasNodeRegistry';
import { sanitizeForPersistence } from '@/lib/canvasNodeSerialization';
import { rpcSaveManifest } from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import type { NoteMetadata } from '../../../../packages/plugin-sdk';
import type {
  ImporterPlacementStrategy,
  ImporterPlacementTarget,
} from './importers';

export const MAX_CANVAS_IMPORT_NOTES = 100;

export interface ImporterPlacementRequest {
  readonly items: readonly (NoteMetadata & { id: string })[];
  readonly operationId: string;
  readonly strategy: ImporterPlacementStrategy;
  readonly viewId: string;
}

export interface ImporterPlacementReceipt {
  readonly nodeIds: readonly string[];
  readonly viewId: string;
}

export interface ImporterPlacementHost {
  getTargets(): readonly ImporterPlacementTarget[];
  place(request: ImporterPlacementRequest): Promise<ImporterPlacementReceipt>;
}

function nodeId(operationId: string, index: number): string {
  return `node-${operationId}-${index + 1}`;
}

function nodeExtent(node: Node): { bottom: number; right: number } {
  const style = node.style as { height?: unknown; width?: unknown } | undefined;
  const width = typeof style?.width === 'number' ? style.width : CARD_W;
  const height = typeof style?.height === 'number' ? style.height : CARD_H;
  return {
    bottom: node.position.y + height,
    right: node.position.x + width,
  };
}

export const canvasImporterPlacementHost: ImporterPlacementHost = {
  getTargets() {
    return useCanvasStore.getState().views.map((view) => ({ ...view }));
  },

  async place(request) {
    if (
      request.items.length < 1 ||
      request.items.length > MAX_CANVAS_IMPORT_NOTES
    ) {
      throw new Error(
        `Canvas placement is limited to ${MAX_CANVAS_IMPORT_NOTES} notes per import`
      );
    }
    const state = useCanvasStore.getState();
    if (state.activeViewId !== request.viewId || !state._hydrated) {
      throw new Error('Open the target canvas and wait for it to load first');
    }
    const known = new Map(state.nodes.map((node) => [node.id, node]));
    const expectedIds = request.items.map((_item, index) =>
      nodeId(request.operationId, index)
    );
    const existing = expectedIds.filter((id) => known.has(id));
    if (existing.length > 0 && existing.length !== expectedIds.length) {
      throw new Error('Canvas contains an incomplete import placement');
    }
    if (
      existing.length === expectedIds.length &&
      request.items.some(
        (item, index) =>
          (
            known.get(expectedIds[index]!)?.data as
              | Record<string, unknown>
              | undefined
          )?.noteId !== item.id
      )
    ) {
      throw new Error('Canvas import placement no longer matches its notes');
    }
    if (existing.length === 0) {
      const topLevel = state.nodes.filter((node) => !node.parentId);
      const extents = topLevel.map(nodeExtent);
      const originX = extents.length
        ? Math.max(...extents.map((extent) => extent.right)) + 80
        : 0;
      const originY = extents.length
        ? Math.min(0, ...topLevel.map((node) => node.position.y))
        : 0;
      const columns = request.strategy === 'grid' ? 4 : 1;
      const spec = buildNewNodeSpec('card');
      const imported = request.items.map(
        (item, index): Node => ({
          ...spec.base,
          data: {
            ...(spec.base.data as Record<string, unknown>),
            blocknoteRevision: item.revision,
            color: item.color,
            noteId: item.id,
            title: item.title,
          },
          id: expectedIds[index]!,
          position: {
            x: originX + (index % columns) * (CARD_W + 40),
            y: originY + Math.floor(index / columns) * (CARD_H + 40),
          },
          selected: false,
          style: { width: CARD_W, height: CARD_H },
        })
      );

      state.saveSnapshot();
      useCanvasStore.setState((current) => ({
        nodes: [...current.nodes, ...imported],
      }));
    }
    const latest = useCanvasStore.getState();
    if (latest.activeViewId !== request.viewId) {
      throw new Error('Target canvas changed while placing imported notes');
    }
    const sanitized = sanitizeForPersistence(latest.nodes, latest.edges);
    const saved = await rpcSaveManifest(
      request.viewId,
      sanitized.nodes,
      sanitized.edges
    );
    if (!saved?.success) {
      throw new Error('Could not save imported notes to the target canvas');
    }
    return Object.freeze({
      nodeIds: Object.freeze(expectedIds),
      viewId: request.viewId,
    });
  },
};
