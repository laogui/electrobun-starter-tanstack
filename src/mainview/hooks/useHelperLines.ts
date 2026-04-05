import { useState, useCallback } from 'react';
import { applyNodeChanges, type Node, type NodeChange, type NodePositionChange } from '@xyflow/react';
import { getHelperLines } from '@/lib/getHelperLines';

interface UseHelperLinesOptions {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
}

export function useHelperLines({ setNodes }: UseHelperLinesOptions) {
  const [helperLineH, setHelperLineH] = useState<number | undefined>();
  const [helperLineV, setHelperLineV] = useState<number | undefined>();

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const positionChange = changes.find(
        (c): c is NodePositionChange => c.type === 'position' && c.dragging === true
      );

      if (positionChange?.position) {
        setNodes((nds) => {
          const { horizontal, vertical, snapPosition } = getHelperLines(positionChange, nds);
          setHelperLineH(horizontal);
          setHelperLineV(vertical);

          if (snapPosition.x !== undefined) {
            positionChange.position!.x = snapPosition.x;
          }
          if (snapPosition.y !== undefined) {
            positionChange.position!.y = snapPosition.y;
          }

          return applyNodeChanges(changes, nds);
        });
      } else {
        setHelperLineH(undefined);
        setHelperLineV(undefined);
        setNodes((nds) => applyNodeChanges(changes, nds));
      }
    },
    [setNodes]
  );

  return { helperLineH, helperLineV, onNodesChange };
}
