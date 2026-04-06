import { useCallback, useRef } from 'react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import { CARD_W, CARD_H, FOLDER_W, FOLDER_H, STICKY_W, STICKY_H, GROUP_COLORS, STICKY_COLORS } from '@/lib/canvasConstants';

interface UseNodeCreationOptions {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  rfInstance: React.MutableRefObject<ReactFlowInstance<any, any> | null>;
  nodeIdCounter: React.MutableRefObject<number>;
}

export function useNodeCreation({ setNodes, rfInstance, nodeIdCounter }: UseNodeCreationOptions) {
  const onCreateNode = useCallback((type: 'card' | 'folder' | 'group' | 'sticky') => {
    const id = `new-${++nodeIdCounter.current}`;
    const viewport = rfInstance.current?.getViewport();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const zoom = viewport?.zoom ?? 1;

    if (type === 'group') {
      const flowX = ((cx - (viewport?.x ?? 0)) / zoom) - 250;
      const flowY = ((cy - (viewport?.y ?? 0)) / zoom) - 150;
      const color = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
      setNodes(nds => [...nds, {
        id,
        type: 'group',
        position: { x: flowX, y: flowY },
        style: { width: 500, height: 300 },
        data: { label: 'New Group', color },
      }]);
      return;
    }

    if (type === 'sticky') {
      const flowX = ((cx - (viewport?.x ?? 0)) / zoom) - STICKY_W / 2;
      const flowY = ((cy - (viewport?.y ?? 0)) / zoom) - STICKY_H / 2;
      const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
      setNodes(nds => [...nds, {
        id,
        type: 'sticky',
        position: { x: flowX, y: flowY },
        style: { width: STICKY_W, height: STICKY_H },
        data: { content: '', color },
      }]);
      return;
    }

    const flowX = ((cx - (viewport?.x ?? 0)) / zoom) - (type === 'card' ? CARD_W : FOLDER_W) / 2;
    const flowY = ((cy - (viewport?.y ?? 0)) / zoom) - (type === 'card' ? CARD_H : FOLDER_H) / 2;

    const newNode: any = type === 'card'
      ? {
          id,
          type: 'card',
          position: { x: flowX, y: flowY },
          style: { width: CARD_W, height: CARD_H },
          data: { type: 'text', title: '', content: '', color: 'bg-white' },
        }
      : {
          id,
          type: 'folder',
          position: { x: flowX, y: flowY },
          data: { title: '0 items', subtitle: '', children: [] },
        };

    setNodes(nds => [...nds, newNode]);
  }, [setNodes, rfInstance, nodeIdCounter]);

  return { onCreateNode };
}
