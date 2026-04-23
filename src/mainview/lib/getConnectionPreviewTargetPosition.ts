import { Position } from '@xyflow/react';

type ConnectionPreviewTargetPositionParams = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

export const getConnectionPreviewTargetPosition = ({
  fromX,
  fromY,
  toX,
  toY,
}: ConnectionPreviewTargetPositionParams): Position => {
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? Position.Left : Position.Right;
  }

  return deltaY >= 0 ? Position.Top : Position.Bottom;
};
