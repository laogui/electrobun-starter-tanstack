import type { ContentChangedEvent } from '../../../packages/plugin-sdk';

export interface PluginContentHistoryEvent {
  action: 'record' | 'redo' | 'undo';
  batchId: string;
  label: string;
  operationId: string;
  pluginId: string;
}

/** Bun-to-renderer payload. `hostHistory` is stripped before public delivery. */
export interface HostContentChangedEvent extends ContentChangedEvent {
  hostHistory?: PluginContentHistoryEvent;
}

export function isPluginContentHistoryEvent(
  value: unknown
): value is PluginContentHistoryEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const event = value as PluginContentHistoryEvent;
  return (
    ['record', 'redo', 'undo'].includes(event.action) &&
    typeof event.batchId === 'string' &&
    event.batchId.length > 0 &&
    typeof event.label === 'string' &&
    typeof event.operationId === 'string' &&
    event.operationId.length > 0 &&
    typeof event.pluginId === 'string' &&
    event.pluginId.length > 0
  );
}
