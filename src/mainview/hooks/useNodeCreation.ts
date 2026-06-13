import type { ReactFlowInstance } from '@xyflow/react';
import { useCallback } from 'react';

import type { CreatableCanvasNodeKind } from '@/lib/contentTypes';
import { type CreateNodeOptions, useCanvasStore } from '@/store/canvasStore';

interface UseNodeCreationOptions {
  rfInstance: React.MutableRefObject<ReactFlowInstance<any, any> | null>;
}

export function useNodeCreation({ rfInstance }: UseNodeCreationOptions) {
  const createNode = useCanvasStore((s) => s.createNode);

  const onCreateNode = useCallback(
    async (type: CreatableCanvasNodeKind, options?: CreateNodeOptions) => {
      if (options) {
        await createNode(type, rfInstance.current, options);
        return;
      }
      await createNode(type, rfInstance.current);
    },
    [createNode, rfInstance]
  );

  return { onCreateNode };
}
