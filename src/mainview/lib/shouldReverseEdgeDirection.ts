import type { Connection } from '@xyflow/react';

export interface ConnectionStartState {
  handleId: string | null;
  nodeId: string | null;
}

export const shouldReverseEdgeDirection = (
  connectionStart: ConnectionStartState,
  connection: Connection
): boolean => {
  if (!connectionStart.nodeId) {
    return false;
  }

  if (connection.source !== connectionStart.nodeId) {
    return true;
  }

  if (!connectionStart.handleId) {
    return false;
  }

  return connection.sourceHandle !== connectionStart.handleId;
};
