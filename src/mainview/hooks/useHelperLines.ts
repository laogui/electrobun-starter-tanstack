import type {
  NodeChange,
  NodeDimensionChange,
  NodePositionChange,
} from '@xyflow/react';
import { useCallback, useRef, useState } from 'react';

import { applyCanvasNodeChanges } from '@/lib/applyCanvasNodeChanges';
import { applyRepulsion, type StoredOrigin } from '@/lib/collision';
import { getHelperLines } from '@/lib/getHelperLines';
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

export function useHelperLines() {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const [helperLineH, setHelperLineH] = useState<number | undefined>();
  const [helperLineV, setHelperLineV] = useState<number | undefined>();

  /** Track pushed origins for resize repulsion. */
  const resizePushedRef = useRef<Map<string, StoredOrigin>>(new Map());
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

      const positionChange = changes.find(
        (c): c is NodePositionChange =>
          c.type === 'position' && c.dragging === true
      );

      if (positionChange?.position) {
        setNodes((nds) => {
          const { horizontal, vertical, snapPosition } = getHelperLines(
            positionChange,
            nds
          );
          setHelperLineH(horizontal);
          setHelperLineV(vertical);

          if (snapPosition.x !== undefined) {
            positionChange.position!.x = snapPosition.x;
          }
          if (snapPosition.y !== undefined) {
            positionChange.position!.y = snapPosition.y;
          }

          const next = applyCanvasNodeChanges(changes, nds);

          // Drag repulsion is handled by useNodeDrag, not here

          return next;
        });
      } else if (resizeChange) {
        // Save snapshot once when resize starts
        if (activeResizeIdRef.current !== resizeChange.id) {
          activeResizeIdRef.current = resizeChange.id;
          resizePushedRef.current.clear();
          saveSnapshot();
        }

        setHelperLineH(undefined);
        setHelperLineV(undefined);
        setNodes((nds) => {
          let next = applyCanvasNodeChanges(changes, nds);

          // Exempt the parent of the resized node so a group containing the
          // active child isn't pushed by repulsion (which would feed back into
          // the child via `extent: 'parent'` and cause flicker).
          const exemptIds = new Set<string>();
          const active = next.find((n) => n.id === resizeChange.id);
          if (active?.parentId) {
            exemptIds.add(active.parentId);
          }

          // Apply repulsion for resize
          next = applyRepulsion({
            nodes: next,
            activeNodeId: resizeChange.id,
            pushedOrigins: resizePushedRef.current,
            exemptIds,
            gap: 20,
          });

          return next;
        });
      } else {
        // Clean up resize state on resize end
        if (resizeEnd) {
          activeResizeIdRef.current = null;
          resizePushedRef.current.clear();
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
