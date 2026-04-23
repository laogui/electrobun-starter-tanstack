import type { ConnectionLineComponentProps } from '@xyflow/react';
import { getBezierPath } from '@xyflow/react';

import { getConnectionPreviewTargetPosition } from '@/lib/getConnectionPreviewTargetPosition';

const ACTIVE_CONNECTION_ARROW_MARKER_ID = 'compact-arrow-active';

export default function ConnectionPreviewLine({
  connectionLineStyle,
  fromPosition,
  fromX,
  fromY,
  toHandle,
  toPosition,
  toX,
  toY,
}: ConnectionLineComponentProps) {
  const resolvedTargetPosition = toHandle
    ? toPosition
    : getConnectionPreviewTargetPosition({
        fromX,
        fromY,
        toX,
        toY,
      });

  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: resolvedTargetPosition,
  });

  return (
    <path
      className="react-flow__connection-path"
      d={path}
      fill="none"
      markerEnd={`url(#${ACTIVE_CONNECTION_ARROW_MARKER_ID})`}
      style={connectionLineStyle}
    />
  );
}
