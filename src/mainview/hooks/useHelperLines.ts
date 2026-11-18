import {
  type DimensionChange,
  NodeChangeset,
  type PositionChange,
} from '@xyflow/react';
import { type MutableRefObject, useCallback, useRef, useState } from 'react';

import { applyCanvasNodeChanges } from '@/lib/applyCanvasNodeChanges';
import type { Point } from '@/lib/collision';
import { getHelperLines } from '@/lib/getHelperLines';
import {
  applyDragRepulsion,
  captureRepulsionOrigins,
  REPULSION_GAP,
} from '@/lib/repulsion';
import { useCanvasStore } from '@/store/canvasStore';

function isResizingChange(
  change: DimensionChange
): change is DimensionChange & {
  dimensions: { width: number; height: number };
  resizing: true;
} {
  return (
    (change as any).resizing === true &&
    (change as any).dimensions !== undefined
  );
}

function pickDraggingReference(
  draggingChanges: PositionChange[],
  anchorId: string | null | undefined
): PositionChange {
  return (
    (anchorId
      ? draggingChanges.find((change) => change.id === anchorId)
      : undefined) ?? draggingChanges[0]!
  );
}

export function useHelperLines(
  gridSize?: number,
  dragAnchorIdRef?: MutableRefObject<string | null>
) {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const [helperLineH, setHelperLineH] = useState<number | undefined>();
  const [helperLineV, setHelperLineV] = useState<number | undefined>();

  /** Gesture-start origins for resize repulsion (`null` = capture lazily). */
  const resizeOriginsRef = useRef<Map<string, Point> | null>(null);
  /** Track which node is actively being resized (to save snapshot once). */
  const activeResizeIdRef = useRef<string | null>(null);
  const alignedAxesRef = useRef({ x: false, y: false });

  const onNodesChange = useCallback(
    (changes: NodeChangeset) => {
      const dimensionChanges = changes.getByType('dimensions');
      // Detect active resize
      const resizeChange = dimensionChanges.find(isResizingChange);

      // Detect resize end (dimensions change with resizing not true)
      const resizeEnd = dimensionChanges.find(
        (c) =>
          (c as any).resizing === false && activeResizeIdRef.current !== null
      );

      // Node-drag position changes always carry an explicit `dragging`
      // boolean (from XYDrag). Resize-induced position changes do not, and
      // fall through to the resize branch below.
      const positionChanges = changes.getByType('position');
      const draggingChanges = positionChanges.filter(
        (c) => c.dragging === true && c.position !== undefined
      );
      const releaseChanges = positionChanges.filter(
        (c) => c.dragging === false
      );

      if (draggingChanges.length > 0) {
        setNodes((nds) => {
          const reference = pickDraggingReference(
            draggingChanges,
            dragAnchorIdRef?.current
          );
          // Exclude every co-dragged node from snap candidates.
          const excludeIds = new Set(positionChanges.map((c) => c.id));
          const { horizontal, vertical, snapPosition } = getHelperLines(
            reference,
            nds,
            excludeIds
          );
          setHelperLineH(horizontal);
          setHelperLineV(vertical);
          alignedAxesRef.current = {
            x: snapPosition.x !== undefined,
            y: snapPosition.y !== undefined,
          };

          // Apply the snap as a delta to all dragged nodes so multi-select
          // formations stay rigid.
          const dx =
            snapPosition.x === undefined
              ? 0
              : snapPosition.x - reference.position!.x;
          const dy =
            snapPosition.y === undefined
              ? 0
              : snapPosition.y - reference.position!.y;
          // Preserve React Flow's drag-state positions across frames.
          const snapped = new NodeChangeset(
            changes.toArray().map((change) =>
              change.type === 'position' && change.dragging && change.position
                ? {
                    ...change,
                    position: {
                      x: change.position.x + dx,
                      y: change.position.y + dy,
                    },
                  }
                : change
            )
          );

          // Drag repulsion is handled by useNodeDrag (onNodeDrag), which
          // React Flow invokes right after this change is applied.
          return applyCanvasNodeChanges(snapped, nds);
        });
      } else if (releaseChanges.length > 0) {
        // Preserve the last helper-aligned position instead of restoring the
        // raw pointer position. Grid snapping is applied once on release.
        setHelperLineH(undefined);
        setHelperLineV(undefined);
        const stripped = new NodeChangeset(
          changes
            .toArray()
            .map((c) =>
              c.type === 'position' && c.dragging === false
                ? { ...c, position: undefined }
                : c
            )
        );
        setNodes((nds) => {
          const next = applyCanvasNodeChanges(stripped, nds);
          if (!gridSize || gridSize <= 0) {
            return next;
          }
          const releasedIds = new Set(releaseChanges.map((c) => c.id));
          const anchorId = dragAnchorIdRef?.current;
          const reference =
            (anchorId && releasedIds.has(anchorId)
              ? nds.find((n) => n.id === anchorId)
              : undefined) ?? nds.find((n) => releasedIds.has(n.id));
          if (!reference) {
            return next;
          }
          // Snap only on release, preserving alignment and selection spacing.
          const dx = alignedAxesRef.current.x
            ? 0
            : Math.round(reference.position.x / gridSize) * gridSize -
              reference.position.x;
          const dy = alignedAxesRef.current.y
            ? 0
            : Math.round(reference.position.y / gridSize) * gridSize -
              reference.position.y;
          return next.map((n) =>
            releasedIds.has(n.id) &&
            !(n.parentId && releasedIds.has(n.parentId))
              ? {
                  ...n,
                  position: { x: n.position.x + dx, y: n.position.y + dy },
                }
              : n
          );
        });
        alignedAxesRef.current = { x: false, y: false };
      } else if (resizeChange) {
        // Save snapshot once when resize starts
        if (activeResizeIdRef.current !== resizeChange.id) {
          activeResizeIdRef.current = resizeChange.id;
          resizeOriginsRef.current = null;
          saveSnapshot();
        }

        setHelperLineH(undefined);
        setHelperLineV(undefined);
        setNodes((nds) => {
          // Capture origins before this frame's resize is applied.
          resizeOriginsRef.current ??= captureRepulsionOrigins(nds);
          const next = applyCanvasNodeChanges(changes, nds);
          return applyDragRepulsion({
            nodes: next,
            activeIds: new Set([resizeChange.id]),
            origins: resizeOriginsRef.current,
            gap: REPULSION_GAP,
          });
        });
      } else {
        // Clean up resize state on resize end
        if (resizeEnd) {
          activeResizeIdRef.current = null;
          resizeOriginsRef.current = null;
        }

        setHelperLineH(undefined);
        setHelperLineV(undefined);
        setNodes((nds) => applyCanvasNodeChanges(changes, nds));
      }
    },
    [setNodes, saveSnapshot, gridSize, dragAnchorIdRef]
  );

  return { helperLineH, helperLineV, onNodesChange };
}
