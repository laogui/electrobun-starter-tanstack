import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { ContentChangedEvent } from '../../../packages/plugin-sdk';

const listeners = new Map<string, Set<(event: ContentChangedEvent) => void>>();

export function pluginWorkspaceId(workspacePath: string): string {
  return createHash('sha256').update(resolve(workspacePath)).digest('hex');
}

export function subscribeContentChanges(
  workspacePath: string,
  listener: (event: ContentChangedEvent) => void
): () => void {
  const workspaceId = pluginWorkspaceId(workspacePath);
  const subscribers = listeners.get(workspaceId) ?? new Set();
  subscribers.add(listener);
  listeners.set(workspaceId, subscribers);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) {
      listeners.delete(workspaceId);
    }
  };
}

export function notifyContentChanged(
  workspacePath: string,
  change: Omit<ContentChangedEvent, 'workspaceId'>
): void {
  const workspaceId = pluginWorkspaceId(workspacePath);
  for (const listener of listeners.get(workspaceId) ?? []) {
    try {
      listener({ ...change, ids: [...change.ids], workspaceId });
    } catch (error) {
      // Delivery failure must not turn an already committed save into a failure.
      console.warn('[plugins] Content notification failed:', error);
    }
  }
}
