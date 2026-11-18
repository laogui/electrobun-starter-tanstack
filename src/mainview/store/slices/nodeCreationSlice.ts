// Canvas store slice: Creating built-in and extension nodes on the canvas.
import type { Node, ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import type { StateCreator } from 'zustand';
import { buildNewNodeSpec } from '@/lib/canvasNodeRegistry';
import { sortNodesByParent } from '@/lib/canvasUtils';
import { buildAbsoluteRects } from '@/lib/collision';
import type { CreatableCanvasNodeKind } from '@/lib/contentTypes';
import {
  markNodesEntering,
  VIEWPORT_PAN_MS,
  viewportMotion,
} from '@/lib/motion';
import { resolveNodePlacement } from '@/lib/resolvePlacement';
import { suppressViewportPersist } from '@/lib/viewportPersist';
import * as m from '../../../paraglide/messages.js';
import { EXTENSION_NODE_TYPE } from '../../../shared/extensions/ids';
import { getViewportCenter } from '../canvas/viewportCenter';
import type { CanvasState, CreateNodeOptions } from '../canvasStore';

export interface NodeCreationSlice {
  createExtensionNode: (
    canvasTypeId: string,
    instanceId: string,
    rfInstance: ReactFlowInstance<any, any> | null,
    options?: CreateNodeOptions
  ) => Promise<string | undefined>;
  createNode: (
    type: CreatableCanvasNodeKind,
    rfInstance: ReactFlowInstance<any, any> | null,
    options?: CreateNodeOptions
  ) => Promise<string | undefined>;

  nextNodeId: () => string;
}

export const createNodeCreationSlice: StateCreator<
  CanvasState,
  [],
  [],
  NodeCreationSlice
> = (set, get) => ({
  nextNodeId: () => `node-${nanoid(8)}`,

  createNode: async (type, rfInstance, options) => {
    const spec = buildNewNodeSpec(type);
    const size = options?.size ?? spec.size;
    const center = options?.anchorCenter ?? getViewportCenter(rfInstance);
    const anchor = options?.anchor ?? {
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
    };

    const { nodes } = get();
    const specType = spec.base.type ?? 'card';
    const { placement, parentId, canPlace } = resolveNodePlacement({
      anchor,
      canEnterGroup: options?.canEnterGroup,
      nodes,
      newType: specType,
      size,
    });

    if (!canPlace) {
      toast.error(m.toast_no_placement_slot());
      return;
    }

    let position = placement;
    if (parentId) {
      const parentRect = buildAbsoluteRects(nodes).get(parentId);
      if (parentRect) {
        position = {
          x: placement.x - parentRect.left,
          y: placement.y - parentRect.top,
        };
      }
    }

    get().saveSnapshot();
    const id = get().nextNodeId();
    const newNode: Node = {
      ...spec.base,
      id,
      position,
      ...(options?.size
        ? {
            style: {
              ...(spec.base.style as Record<string, unknown>),
              width: size.width,
              height: size.height,
            },
          }
        : {}),
      data: {
        ...(spec.base.data as Record<string, unknown>),
        ...(options?.data ?? {}),
      },
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    };
    markNodesEntering([id]);
    set((s) => ({ nodes: sortNodesByParent([...s.nodes, newNode]) }));

    if (
      options?.focusViewport !== false &&
      typeof rfInstance?.setCenter === 'function'
    ) {
      suppressViewportPersist(300);
      rfInstance.setCenter(
        placement.x + size.width / 2,
        placement.y + size.height / 2,
        {
          ...viewportMotion(VIEWPORT_PAN_MS),
          zoom: rfInstance.getViewport().zoom,
        }
      );
    }

    return id;
  },

  createExtensionNode: async (
    canvasTypeId,
    instanceId,
    rfInstance,
    options
  ) => {
    const size = options?.size ?? { width: 240, height: 200 };
    const viewport = rfInstance?.getViewport();
    const zoom = viewport?.zoom ?? 1;
    const viewportCenter = rfInstance?.screenToFlowPosition
      ? rfInstance.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        })
      : {
          x: (window.innerWidth / 2 - (viewport?.x ?? 0)) / zoom,
          y: (window.innerHeight / 2 - (viewport?.y ?? 0)) / zoom,
        };
    const center = options?.anchorCenter ?? viewportCenter;
    const anchor = options?.anchor ?? {
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
    };
    const { nodes } = get();
    const { placement, parentId, canPlace } = resolveNodePlacement({
      anchor,
      nodes,
      newType: EXTENSION_NODE_TYPE,
      size,
      canEnterGroup: true,
    });
    if (!canPlace) {
      toast.error(m.toast_no_placement_slot());
      return;
    }
    let position = placement;
    if (parentId) {
      const parentRect = buildAbsoluteRects(nodes).get(parentId);
      if (parentRect) {
        position = {
          x: placement.x - parentRect.left,
          y: placement.y - parentRect.top,
        };
      }
    }
    get().saveSnapshot();
    const id = get().nextNodeId();
    const newNode: Node = {
      id,
      type: EXTENSION_NODE_TYPE,
      position,
      style: { width: size.width, height: size.height },
      data: {
        canvasTypeId,
        instanceId,
        ...(options?.data ?? {}),
      },
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    };
    markNodesEntering([id]);
    set((s) => ({ nodes: sortNodesByParent([...s.nodes, newNode]) }));
    if (
      options?.focusViewport !== false &&
      typeof rfInstance?.setCenter === 'function'
    ) {
      suppressViewportPersist(300);
      rfInstance.setCenter(
        placement.x + size.width / 2,
        placement.y + size.height / 2,
        { ...viewportMotion(VIEWPORT_PAN_MS), zoom }
      );
    }
    return id;
  },
});
