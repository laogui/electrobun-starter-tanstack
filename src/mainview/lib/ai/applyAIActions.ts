import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { addEdge } from '@xyflow/react';
import { nanoid } from 'nanoid';

import { isGroupChildNode, isPinnedSticky } from '@/lib/canvasNodePredicates';
import { buildNewNodeSpec, getNodeSpec } from '@/lib/canvasNodeRegistry';
import { sortNodesByParent } from '@/lib/canvasUtils';
import { buildAbsoluteRects } from '@/lib/collision';
import { resolveNodePlacement } from '@/lib/resolvePlacement';
import { getCachedLicense, refreshLicense } from '@/lib/rpc-license';
import { useCanvasStore } from '@/store/canvasStore';

import { filterValidAIActions } from '../../../shared/ai/schema';
import type { AIAction } from '../../../shared/ai/types';

/**
 * Renderer-side apply pipeline for AI-proposed actions
 * (docs/features/Backlog/ai-integration-plan.md §7.3).
 *
 * Guarantees:
 * - Every action is re-validated with zod before touching the store.
 * - One apply = exactly one undo snapshot (the batch path saves a single
 *   snapshot up front; the single-create fast path reuses `createNode`,
 *   which snapshots internally).
 * - Malformed or unresolvable actions are skipped with a warning instead of
 *   aborting the whole batch.
 */

/** Padding around grouped children — mirrors `canvasStore.groupSelected`. */
const AI_GROUP_PADDING = 24;

/** Free-tier card/sticky ceiling, mirrors `canvasStore.createNode`. */
const CARD_LIMIT = 100;

export interface ApplyAIActionsResult {
  /** Number of actions that actually mutated the canvas. */
  applied: number;
  /** Real ids of every node created by this batch. */
  createdNodeIds: string[];
  /** Human-readable warnings for dropped/malformed/skipped actions. */
  warnings: string[];
}

/**
 * Validate and apply a batch of AI actions to the active canvas.
 * Safe to call with untrusted (model-produced) input.
 */
export async function applyAIActions(
  rfInstance: ReactFlowInstance<any, any> | null,
  rawActions: unknown[]
): Promise<ApplyAIActionsResult> {
  const { actions, warnings } = filterValidAIActions(rawActions);
  if (actions.length === 0) {
    return { applied: 0, createdNodeIds: [], warnings };
  }

  const store = useCanvasStore.getState();
  const first = actions[0];

  // Fast path: a single create_node can reuse the store's full creation flow
  // (license gate, collision-aware placement, snapshot, viewport focus).
  if (actions.length === 1 && first?.type === 'create_node') {
    const id = await store.createNode(first.nodeKind, rfInstance, {
      anchor: first.position,
      data: first.data,
      focusViewport: true,
      size: first.size,
    });
    if (!id) {
      return {
        applied: 0,
        createdNodeIds: [],
        warnings: [
          ...warnings,
          'Node was not created (card limit reached or no free position)',
        ],
      };
    }
    return { applied: 1, createdNodeIds: [id], warnings };
  }

  return applyActionBatch(actions, warnings);
}

// ---------------------------------------------------------------------------
// Batch path
// ---------------------------------------------------------------------------

async function applyActionBatch(
  actions: AIAction[],
  warnings: string[]
): Promise<ApplyAIActionsResult> {
  const store = useCanvasStore.getState();

  // License gate for batch card/sticky creation (mirrors createNode).
  const limitedCreates = actions.filter(
    (a) =>
      a.type === 'create_node' &&
      (a.nodeKind === 'card' || a.nodeKind === 'sticky')
  ).length;
  const currentLimitedCount = store.nodes.filter(
    (n) => n.type === 'card' || n.type === 'sticky'
  ).length;
  if (limitedCreates > 0 && currentLimitedCount + limitedCreates > CARD_LIMIT) {
    const allowed = await checkCardLimit();
    if (!allowed) {
      return {
        applied: 0,
        createdNodeIds: [],
        warnings: [
          ...warnings,
          'Free version limited to 100 cards. Activate a license to continue.',
        ],
      };
    }
  }

  // Allocate real ids for every tempId up front so later actions can
  // reference nodes created earlier in the same batch.
  const tempIds = new Map<string, string>();
  for (const action of actions) {
    if (
      (action.type === 'create_node' || action.type === 'create_group') &&
      !tempIds.has(action.tempId)
    ) {
      tempIds.set(action.tempId, store.nextNodeId());
    }
  }
  const resolveId = (id: string): string => tempIds.get(id) ?? id;

  let workingNodes: Node[] = store.nodes.map((node) => ({ ...node }));
  let workingEdges: Edge[] = [...store.edges];
  const createdNodeIds: string[] = [];
  let applied = 0;

  // One snapshot for the whole batch → one undo step.
  store.saveSnapshot();

  for (const action of actions) {
    switch (action.type) {
      case 'create_node': {
        const id = tempIds.get(action.tempId);
        if (!id) {
          break;
        }
        const spec = buildNewNodeSpec(action.nodeKind);
        const size = action.size ?? spec.size;
        const { canPlace, parentId, placement } = resolveNodePlacement({
          anchor: action.position,
          newType: getNodeSpec(action.nodeKind).nodeType,
          nodes: workingNodes,
          size,
        });
        if (!canPlace) {
          warnings.push(
            `Skipped create_node "${action.tempId}": no free position found`
          );
          break;
        }
        let position = placement;
        if (parentId) {
          const parentRect = buildAbsoluteRects(workingNodes).get(parentId);
          if (parentRect) {
            position = {
              x: placement.x - parentRect.left,
              y: placement.y - parentRect.top,
            };
          }
        }
        const newNode: Node = {
          ...spec.base,
          id,
          position,
          ...(action.size
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
            ...action.data,
          },
          ...(parentId ? { parentId, extent: 'parent' as const } : {}),
        };
        workingNodes = [...workingNodes, newNode];
        createdNodeIds.push(id);
        applied += 1;
        break;
      }

      case 'update_node': {
        const nodeId = resolveId(action.nodeId);
        if (!workingNodes.some((n) => n.id === nodeId)) {
          warnings.push(
            `Skipped update_node "${action.nodeId}": node not found on canvas`
          );
          break;
        }
        workingNodes = workingNodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...(n.data as Record<string, unknown>),
                  ...action.updates,
                },
              }
            : n
        );
        applied += 1;
        break;
      }

      case 'move_node': {
        const nodeId = resolveId(action.nodeId);
        const node = workingNodes.find((n) => n.id === nodeId);
        if (!node) {
          warnings.push(
            `Skipped move_node "${action.nodeId}": node not found on canvas`
          );
          break;
        }
        if ((node.data as { locked?: unknown }).locked) {
          warnings.push(`Skipped move_node "${action.nodeId}": node is locked`);
          break;
        }
        if (isPinnedSticky(node)) {
          warnings.push(
            `Skipped move_node "${action.nodeId}": sticky position is pinned`
          );
          break;
        }
        if (node.parentId) {
          warnings.push(
            `Skipped move_node "${action.nodeId}": moving grouped/foldered nodes is not supported yet`
          );
          break;
        }
        workingNodes = workingNodes.map((n) =>
          n.id === nodeId ? { ...n, position: action.position } : n
        );
        applied += 1;
        break;
      }

      case 'create_group': {
        const groupId = tempIds.get(action.tempId);
        if (!groupId) {
          break;
        }
        const seen = new Set<string>();
        const childIds: string[] = [];
        for (const rawChildId of action.childIds) {
          const childId = resolveId(rawChildId);
          if (seen.has(childId)) {
            continue;
          }
          seen.add(childId);
          const child = workingNodes.find((n) => n.id === childId);
          if (child && isGroupChildNode(child.type)) {
            childIds.push(childId);
          }
        }
        if (childIds.length === 0) {
          warnings.push(
            `Skipped create_group "${action.label}": no groupable children found`
          );
          break;
        }
        const absoluteRects = buildAbsoluteRects(workingNodes);
        const rects = childIds
          .map((id) => absoluteRects.get(id))
          .filter((rect) => rect !== undefined);
        if (rects.length === 0) {
          warnings.push(
            `Skipped create_group "${action.label}": children have no measurable bounds`
          );
          break;
        }
        const left = Math.min(...rects.map((rect) => rect.left));
        const top = Math.min(...rects.map((rect) => rect.top));
        const right = Math.max(...rects.map((rect) => rect.right));
        const bottom = Math.max(...rects.map((rect) => rect.bottom));
        const groupPosition = {
          x: left - AI_GROUP_PADDING,
          y: top - AI_GROUP_PADDING,
        };
        const groupWidth = right - left + AI_GROUP_PADDING * 2;
        const groupHeight = bottom - top + AI_GROUP_PADDING * 2;
        const groupSpec = buildNewNodeSpec('group');
        const groupNode: Node = {
          ...groupSpec.base,
          id: groupId,
          position: groupPosition,
          style: {
            ...groupSpec.base.style,
            width: groupWidth,
            height: groupHeight,
          },
          data: {
            ...(groupSpec.base.data as Record<string, unknown>),
            label: action.label,
            ...(action.color ? { color: action.color } : {}),
          },
        };
        const childIdSet = new Set(childIds);
        workingNodes = [
          ...workingNodes.map((node) => {
            if (!childIdSet.has(node.id)) {
              return node;
            }
            const rect = absoluteRects.get(node.id);
            const {
              parentId: _parentId,
              extent: _extent,
              ...rest
            } = node as any;
            return {
              ...rest,
              parentId: groupId,
              extent: 'parent' as const,
              position: {
                x: (rect?.left ?? node.position.x) - groupPosition.x,
                y: (rect?.top ?? node.position.y) - groupPosition.y,
              },
            } as Node;
          }),
          groupNode,
        ];
        createdNodeIds.push(groupId);
        applied += 1;
        break;
      }

      case 'create_edge': {
        const source = resolveId(action.source);
        const target = resolveId(action.target);
        if (source === target) {
          warnings.push(
            `Skipped create_edge "${action.source} → ${action.target}": self-connections are not allowed`
          );
          break;
        }
        const nodeIds = new Set(workingNodes.map((n) => n.id));
        if (!(nodeIds.has(source) && nodeIds.has(target))) {
          warnings.push(
            `Skipped create_edge "${action.source} → ${action.target}": endpoint not found on canvas`
          );
          break;
        }
        workingEdges = addEdge(
          {
            id: `edge-${nanoid(8)}`,
            source,
            target,
            type: 'labeledEdge',
            data: {
              pathType: 'bezier',
              reverseVisualDirection: false,
              ...(action.label ? { label: action.label } : {}),
            },
            markerEnd: 'compact-arrow',
          },
          workingEdges
        );
        applied += 1;
        break;
      }
    }
  }

  if (applied > 0) {
    useCanvasStore.setState({
      nodes: sortNodesByParent(workingNodes),
      edges: workingEdges,
    });
  }

  return { applied, createdNodeIds, warnings };
}

/** Mirrors the license escape hatch inside `canvasStore.createNode`. */
async function checkCardLimit(): Promise<boolean> {
  try {
    const cachedLicense = getCachedLicense();
    const license = cachedLicense?.activated
      ? cachedLicense
      : await refreshLicense();
    if (license && !license.activated) {
      return false;
    }
  } catch (error) {
    console.error('[AI] License check failed:', error);
    // Continue on error to avoid blocking offline users (same as createNode).
  }
  return true;
}
