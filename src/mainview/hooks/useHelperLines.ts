import type { NodeChange, NodePositionChange } from '@xyflow/react';
import { useCallback, useState } from 'react';

import { applyCanvasNodeChanges } from '@/lib/applyCanvasNodeChanges';
import { getHelperLines } from '@/lib/getHelperLines';
import { useCanvasStore } from '@/store/canvasStore';

export function useHelperLines() {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const [helperLineH, setHelperLineH] = useState<number | undefined>();
  const [helperLineV, setHelperLineV] = useState<number | undefined>();

  const onNodesChange = useCallback(
    (changes: Array<NodeChange>) => {
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

          return applyCanvasNodeChanges(changes, nds);
        });
      } else {
        setHelperLineH(undefined);
        setHelperLineV(undefined);
        setNodes((nds) => applyCanvasNodeChanges(changes, nds));
      }
    },
    [setNodes]
  );

  return { helperLineH, helperLineV, onNodesChange };
}
