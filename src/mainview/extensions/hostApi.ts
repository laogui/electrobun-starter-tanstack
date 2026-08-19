import { toast } from 'sonner';
import { classifyFile, normalizeLinkUrl } from '@/lib/contentTypes';
import {
  rpcCancelExtensionTask,
  rpcListExtensionTasks,
  rpcLoadAttachment,
  rpcOpenAttachment,
  rpcOpenExternalUrl,
  rpcScheduleExtensionTask,
  rpcUnfurlLink,
  uploadAttachmentBlob,
} from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { isExtensionInstanceLoadError } from '../../shared/extensions/instance';
import type {
  ExtensionStateSnapshot,
  GhostBoardHostAPI,
  Size,
} from '../../shared/extensions/protocol';

function pickFiles(accept?: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) {
      input.accept = accept;
    }
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
    });
    input.click();
  });
}

export function createExtensionHostApi(input: {
  canvasTypeId: string;
  instanceId: string;
  nodeId?: string;
  onRequestResize?: (size: Partial<Size>) => Promise<Size>;
}): GhostBoardHostAPI {
  const { canvasTypeId, instanceId, nodeId, onRequestResize } = input;

  return {
    instance: {
      getState(): ExtensionStateSnapshot {
        const record = useExtensionInstanceStore.getState().records[instanceId];
        if (!record || isExtensionInstanceLoadError(record)) {
          return { revision: 0, state: null, presentation: { title: '' } };
        }
        return {
          revision: record.revision,
          state: record.state,
          presentation: record.presentation,
        };
      },
      updateState: (request) =>
        useExtensionInstanceStore.getState().updateState(instanceId, request),
    },
    canvas: {
      requestResize: (size) =>
        onRequestResize
          ? onRequestResize(size)
          : Promise.resolve({ width: 0, height: 0 }),
      openDetail: async () => {
        if (!nodeId) {
          return;
        }
        const node = useCanvasStore
          .getState()
          .nodes.find((entry) => entry.id === nodeId);
        if (!node) {
          return;
        }
        const el = document.querySelector(`[data-id="${nodeId}"]`);
        const rect = el?.getBoundingClientRect() ?? new DOMRect();
        useCanvasStore.getState().setFocusedNode({
          id: nodeId,
          type: node.type ?? 'extension',
          data: (node.data ?? {}) as Record<string, unknown>,
          rect,
        });
      },
      closeDetail: async () => {
        useCanvasStore.getState().setFocusedNode(null);
      },
    },
    assets: {
      importFile: async (options) => {
        const file = await pickFiles(options?.accept);
        if (!file) {
          return null;
        }
        const classified = classifyFile(file);
        const kind = file.type.startsWith('image/') ? 'image' : classified.kind;
        const saved = await uploadAttachmentBlob(file, {
          fileName: file.name,
          kind,
          mimeType: classified.mimeType,
        });
        if (!saved.filePath) {
          return null;
        }
        return { id: saved.filePath };
      },
      getUrl: async (assetId) => {
        const loaded = await rpcLoadAttachment(assetId);
        if (!loaded?.dataUrl) {
          throw new Error('Unable to load attachment.');
        }
        return loaded.dataUrl;
      },
      getMetadata: async (assetId) => {
        const loaded = await rpcLoadAttachment(assetId);
        if (!loaded?.dataUrl) {
          throw new Error('Unable to load attachment metadata.');
        }
        return {
          mimeType: 'application/octet-stream',
          name: assetId.split('/').pop() ?? assetId,
          size: loaded.dataUrl.length,
        };
      },
      remove: async () => undefined,
    },
    scheduler: {
      schedule: async (task) => {
        await rpcScheduleExtensionTask({
          ...task,
          canvasTypeId,
          instanceId,
        });
      },
      cancel: async (taskId) => {
        await rpcCancelExtensionTask(taskId);
      },
      list: async () => {
        const result = await rpcListExtensionTasks(instanceId);
        return result.tasks.map((task) => ({
          id: task.id,
          fireAt: task.fireAt,
          ...(task.repeat ? { repeat: task.repeat } : {}),
          ...(task.payload !== undefined ? { payload: task.payload } : {}),
        }));
      },
    },
    notifications: {
      show: async (notification) => {
        toast(notification.title, {
          description: notification.body,
        });
      },
    },
    external: {
      openUrl: async (url) => {
        const normalized = normalizeLinkUrl(url);
        if (normalized) {
          await rpcOpenExternalUrl(normalized);
          return;
        }
        await rpcOpenAttachment(url);
      },
    },
    network: {
      fetch: async ({ url }) => {
        const result = await rpcUnfurlLink(url);
        if (!result) {
          return { status: 0, body: '' };
        }
        return { status: 200, body: JSON.stringify(result) };
      },
    },
  };
}
