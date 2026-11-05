import type { Node } from '@xyflow/react';
import { toast } from 'sonner';
import * as m from '../../../paraglide/messages.js';
import { EXTENSION_NODE_TYPE } from '../../../shared/extensions/ids';
// Clone extension backing records when nodes are pasted or duplicated.

/**
 * Detect whether any node in the graph references an extension instance -
 * either top-level or as a child nested inside a folder's `data.children`.
 * Used to gate cloning so folder-only paste/duplicate is not silently skipped.
 */
export function graphContainsExtensionReference(nodes: Node[]): boolean {
  for (const node of nodes) {
    if (node.type === EXTENSION_NODE_TYPE) {
      return true;
    }
    if (node.type === 'folder') {
      const children = (node.data as { children?: Array<{ type?: string }> })
        ?.children;
      if (
        Array.isArray(children) &&
        children.some((child) => child?.type === EXTENSION_NODE_TYPE)
      ) {
        return true;
      }
    }
  }
  return false;
}

export async function cloneExtensionReferences(
  nodes: Node[],
  onCreated?: (id: string) => void
): Promise<Node[]> {
  const { useExtensionInstanceStore } = await import(
    '@/store/extensionInstanceStore'
  );
  const { cloneInstance } = useExtensionInstanceStore.getState();

  async function cloneInstanceId(instanceId: unknown): Promise<string | null> {
    if (typeof instanceId !== 'string' || !instanceId) {
      return null;
    }
    const record = await cloneInstance(instanceId);
    if (!record) {
      toast.error(m.toast_clone_canvas_type_failed());
      return null;
    }
    onCreated?.(record.id);
    return record.id;
  }

  const results = await mapSerial(nodes, async (node) => {
    if (node.type === EXTENSION_NODE_TYPE) {
      const data = node.data as Record<string, unknown>;
      const clonedId = await cloneInstanceId(data.instanceId);
      if (!clonedId) {
        return null;
      }
      return {
        ...node,
        data: {
          ...data,
          instanceId: clonedId,
        },
      };
    }

    if (node.type === 'folder') {
      const data = node.data as Record<string, unknown>;
      const children = data?.children;
      if (!Array.isArray(children)) {
        return node;
      }
      const nextChildren = await mapSerial(children, async (rawChild) => {
        const child = rawChild as {
          data?: Record<string, unknown>;
          type?: string;
        } | null;
        if (!child || child.type !== EXTENSION_NODE_TYPE) {
          return child;
        }
        const childData = child.data;
        const clonedId = await cloneInstanceId(childData?.instanceId);
        if (!clonedId) {
          return null;
        }
        return {
          ...child,
          data: { ...(childData ?? {}), instanceId: clonedId },
        };
      });
      return {
        ...node,
        data: {
          ...data,
          children: nextChildren.filter((child) => child !== null),
        },
      };
    }

    return node;
  });

  return results.filter((node): node is Node => node !== null);
}

async function mapSerial<T, R>(
  items: T[],
  visit: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) {
    results.push(await visit(item));
  }
  return results;
}

export async function finishCreatedClones(
  ids: string[],
  state: import('../canvasStore').CanvasState
): Promise<void> {
  if (!ids.length) {
    return;
  }
  const references = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'instanceId' && typeof child === 'string') {
          references.add(child);
        } else if (child && typeof child === 'object') {
          visit(child);
        }
      }
    }
  };
  visit([
    state.nodes,
    state.clipboard,
    state._undoRedo,
    state.focusedNode,
    state.focusedFolder,
  ]);
  try {
    const { listRecoveryArchives } = await import('@/lib/pendingFlushBackup');
    for (const entry of listRecoveryArchives()) {
      if (entry.backup) {
        visit(entry.backup.nodes);
      }
    }
    const { rpcFinishCanvasClones } = await import('@/lib/rpc');
    const { removed } = await rpcFinishCanvasClones(ids, [...references]);
    if (!removed.length) {
      return;
    }
    const { useExtensionInstanceStore } = await import(
      '@/store/extensionInstanceStore'
    );
    useExtensionInstanceStore.setState((state) => {
      const records = { ...state.records };
      const history = { ...state.history };
      for (const id of removed) {
        delete records[id];
        delete history[id];
      }
      return { records, history };
    });
  } catch (error) {
    console.warn(
      '[clipboard] Clone cleanup retained recovery evidence:',
      error
    );
    toast.warning(m.toast_clone_cleanup_retained(), {
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: m.clone_cleanup_retry(),
        onClick: () => {
          import('../canvasStore')
            .then(({ useCanvasStore }) =>
              finishCreatedClones(ids, useCanvasStore.getState())
            )
            .catch(() => undefined);
        },
      },
    });
  }
}
