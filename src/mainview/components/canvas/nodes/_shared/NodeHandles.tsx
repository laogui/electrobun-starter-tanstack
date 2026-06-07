import { Handle, Position } from '@xyflow/react';

const HANDLE_CLASS = 'conn-handle nodrag';

export interface NodeHandlesProps {
  bottomStyle?: React.CSSProperties;
  leftStyle?: React.CSSProperties;
  rightStyle?: React.CSSProperties;
  topStyle?: React.CSSProperties;
}

export function NodeHandles({
  topStyle,
  rightStyle,
  bottomStyle,
  leftStyle,
}: NodeHandlesProps = {}) {
  return (
    <>
      <Handle
        className={HANDLE_CLASS}
        id="top"
        position={Position.Top}
        style={topStyle}
        type="source"
      />
      <Handle
        className={HANDLE_CLASS}
        id="right"
        position={Position.Right}
        style={rightStyle}
        type="source"
      />
      <Handle
        className={HANDLE_CLASS}
        id="bottom"
        position={Position.Bottom}
        style={bottomStyle}
        type="source"
      />
      <Handle
        className={HANDLE_CLASS}
        id="left"
        position={Position.Left}
        style={leftStyle}
        type="source"
      />
    </>
  );
}
