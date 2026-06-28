import type { ConnectionLineComponentProps } from '@xyflow/react';
import { getBezierPath } from '@xyflow/react';

import { getFloatingSourceParams } from '@/lib/floatingEdge';
import { getConnectionPreviewTargetPosition } from '@/lib/getConnectionPreviewTargetPosition';

const ACTIVE_CONNECTION_ARROW_MARKER_ID = 'compact-arrow-active';

export default function ConnectionPreviewLine({
  connectionLineStyle,
  fromNode,
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

  // Float the source endpoint to the border of the origin card that faces the
  // pointer, so the preview matches the routed edge and never doubles back.
  const floatingSource = getFloatingSourceParams(fromNode, { x: toX, y: toY });

  const [path] = getBezierPath({
    sourceX: floatingSource?.sx ?? fromX,
    sourceY: floatingSource?.sy ?? fromY,
    sourcePosition: floatingSource?.sourcePos ?? fromPosition,
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
