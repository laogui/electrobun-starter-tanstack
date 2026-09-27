import type { ConnectionLineComponentProps } from '@xyflow/react';
import { getBezierPath } from '@xyflow/react';

import { ARROW_SIZE } from '@/lib/edgeMarkers';
import { getFloatingSourceParams } from '@/lib/floatingEdge';
import { getConnectionPreviewTargetPosition } from '@/lib/getConnectionPreviewTargetPosition';

// React Flow only generates marker defs for edges, not the connection line, so
// this mirrors its built-in `ArrowClosed` geometry (see `arrowMarker`).
const ACTIVE_CONNECTION_ARROW_MARKER_ID = 'connection-preview-arrow';
const ACTIVE_CONNECTION_COLOR = 'hsl(var(--connection-active))';

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
    <>
      <defs>
        <marker
          className="react-flow__arrowhead"
          id={ACTIVE_CONNECTION_ARROW_MARKER_ID}
          markerHeight={ARROW_SIZE}
          markerUnits="userSpaceOnUse"
          markerWidth={ARROW_SIZE}
          orient="auto-start-reverse"
          refX="0"
          refY="0"
          viewBox="-10 -10 20 20"
        >
          <polyline
            points="-5,-4 0,0 -5,4 -5,-4"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              fill: ACTIVE_CONNECTION_COLOR,
              stroke: ACTIVE_CONNECTION_COLOR,
              strokeWidth: 1,
            }}
          />
        </marker>
      </defs>
      <path
        className="react-flow__connection-path"
        d={path}
        fill="none"
        markerEnd={`url(#${ACTIVE_CONNECTION_ARROW_MARKER_ID})`}
        style={connectionLineStyle}
      />
    </>
  );
}
