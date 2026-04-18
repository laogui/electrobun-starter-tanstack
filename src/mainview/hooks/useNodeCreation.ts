import type { ReactFlowInstance } from '@xyflow/react';
import { useCallback } from 'react';

import { useCanvasStore } from '@/store/canvasStore';

interface UseNodeCreationOptions {
  rfInstance: React.MutableRefObject<ReactFlowInstance<any, any> | null>;
}

export function useNodeCreation({ rfInstance }: UseNodeCreationOptions) {
  const createNode = useCanvasStore((s) => s.createNode);

  const onCreateNode = useCallback(
    (type: 'card' | 'checklist' | 'image' | 'folder' | 'group' | 'sticky') => {
      createNode(type, rfInstance.current);
    },
    [createNode, rfInstance]
  );

  return { onCreateNode };
}
