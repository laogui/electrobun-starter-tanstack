import type {
  NodeChange,
  NodeDimensionChange,
  NodePositionChange,
} from '@xyflow/react';
import { useCallback, useRef, useState } from 'react';

import { applyCanvasNodeChanges } from '@/lib/applyCanvasNodeChanges';
import type { Point } from '@/lib/collision';
import { getHelperLines } from '@/lib/getHelperLines';
import {
  applyDragRepulsion,
  captureRepulsionOrigins,
  REPULSION_GAP,
} from '@/lib/repulsion';
import { useCanvasStore } from '@/store/canvasStore';

function isResizingChange(change: NodeChange): change is NodeDimensionChange & {
  dimensions: { width: number; height: number };
  resizing: true;
} {
  return (
    change.type === 'dimensions' &&
    (change as any).resizing === true &&
    (change as any).dimensions !== undefined
  );
}

function isPositionChange(change: NodeChange): change is NodePositionChange {
  return change.type === 'position';
}

export function useHelperLines() {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const [helperLineH, setHelperLineH] = useState<number | undefined>();
  const [helperLineV, setHelperLineV] = useState<number | undefined>();

  /** Gesture-start origins for resize repulsion (`null` = capture lazily). */
  const resizeOriginsRef = useRef<Map<string, Point> | null>(null);
  /** Track which node is actively being resized (to save snapshot once). */
  const activeResizeIdRef = useRef<string | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Detect active resize
      const resizeChange = changes.find(isResizingChange);

      // Detect resize end (dimensions change with resizing not true)
      const resizeEnd = changes.find(
        (c): c is NodeDimensionChange =>
          c.type === 'dimensions' &&
          (c as any).resizing === false &&
          activeResizeIdRef.current !== null
      );

      // Node-drag position changes always carry an explicit `dragging`
      // boolean (from XYDrag). Resize-induced position changes do not, and
      // fall through to the resize branch below.
      const positionChanges = changes.filter(isPositionChange);
      const draggingChanges = positionChanges.filter(
        (c) => c.dragging === true && c.position !== undefined
      );
      const releaseChanges = positionChanges.filter(
        (c) => c.dragging === false
      );

      if (draggingChanges.length > 0) {
        setNodes((nds) => {
          const reference = draggingChanges[0]!;
          // Exclude every co-dragged node from snap candidates.
          const excludeIds = new Set(positionChanges.map((c) => c.id));
          const { horizontal, vertical, snapPosition } = getHelperLines(
            reference,
            nds,
            excludeIds
          );
          setHelperLineH(horizontal);
          setHelperLineV(vertical);

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
          if (dx !== 0 || dy !== 0) {
            for (const change of draggingChanges) {
              change.position!.x += dx;
              change.position!.y += dy;
            }
          }

          // Drag repulsion is handled by useNodeDrag (onNodeDrag), which
          // React Flow invokes right after this change is applied.
          return applyCanvasNodeChanges(changes, nds);
        });
      } else if (releaseChanges.length > 0) {
        // Drag release: the store already holds the final (snapped) position
        // from the last drag frame, while this change carries the raw
        // unsnapped one. Strip positions so releasing never causes a jump,
        // and only the `dragging` flag is cleared.
        setHelperLineH(undefined);
        setHelperLineV(undefined);
        const stripped = changes.map((c) =>
          isPositionChange(c) && c.dragging === false
            ? { ...c, position: undefined }
            : c
        );
        setNodes((nds) => applyCanvasNodeChanges(stripped, nds));
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
    [setNodes, saveSnapshot]
  );

  return { helperLineH, helperLineV, onNodesChange };
}
