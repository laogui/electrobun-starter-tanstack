import { Handle, Position } from '@xyflow/react';

const HANDLE_CLASS = 'conn-handle nodrag';

export function NodeHandles() {
  return (
    <>
      <Handle
        className={HANDLE_CLASS}
        id="top"
        position={Position.Top}
        type="source"
      />
      <Handle
        className={HANDLE_CLASS}
        id="right"
        position={Position.Right}
        type="source"
      />
      <Handle
        className={HANDLE_CLASS}
        id="bottom"
        position={Position.Bottom}
        type="source"
      />
      <Handle
        className={HANDLE_CLASS}
        id="left"
        position={Position.Left}
        type="source"
      />
    </>
  );
}
