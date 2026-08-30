import { toast } from 'sonner';
import { saveAssetFileWithProgressToast } from '@/lib/assetImportProgress';
import { type AssetNodeData, normalizeLinkUrl } from '@/lib/contentTypes';
import {
  rpcCancelExtensionTask,
  rpcListExtensionTasks,
  rpcLoadAttachment,
  rpcOpenAttachment,
  rpcOpenExternalUrl,
  rpcRevealAttachment,
  rpcScheduleExtensionTask,
  rpcUnfurlLink,
} from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import * as m from '../../paraglide/messages.js';
import { isExtensionInstanceLoadError } from '../../shared/extensions/instance';
import type {
  AssetMetadata,
  ExtensionStateSnapshot,
  GhostBoardHostAPI,
  Size,
} from '../../shared/extensions/protocol';

const importedAssetMetadata = new Map<string, AssetMetadata>();

function metadataFromSavedAsset(data: AssetNodeData): AssetMetadata {
  return {
    mimeType: data.mimeType,
    name: data.fileName,
    size: data.size ?? 0,
    kind: data.mimeType.startsWith('image/') ? 'image' : data.kind,
    ...(data.thumbnailFile ? { thumbnailId: data.thumbnailFile } : {}),
    ...(typeof data.duration === 'number' ? { duration: data.duration } : {}),
    ...(data.previewExcerpt ? { previewExcerpt: data.previewExcerpt } : {}),
    ...(data.waveform && data.waveform.length > 0
      ? { waveform: data.waveform }
      : {}),
    ...(data.archiveSummary ? { archiveSummary: data.archiveSummary } : {}),
  };
}

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
  folderId?: string;
  instanceId: string;
  nodeId?: string;
  onRequestResize?: (size: Partial<Size>) => Promise<Size>;
}): GhostBoardHostAPI {
  const { canvasTypeId, folderId, instanceId, nodeId, onRequestResize } = input;

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
        const { nodes, setFocusedNode } = useCanvasStore.getState();
        if (folderId) {
          const folder = nodes.find((entry) => entry.id === folderId);
          const children =
            (
              folder?.data as
                | {
                    children?: ReadonlyArray<{
                      data: Record<string, unknown>;
                      id: string;
                      type: string;
                    }>;
                  }
                | undefined
            )?.children ?? [];
          const child = children.find((entry) => entry.id === nodeId);
          if (!child) {
            return;
          }
          const expanded = Array.from(
            document.querySelectorAll<HTMLElement>(
              '[data-folder-expanded-visual-id]'
            )
          ).find(
            (element) => element.dataset.folderExpandedVisualId === child.id
          );
          setFocusedNode({
            id: child.id,
            type: child.type,
            data: child.data,
            folderId,
            rect: expanded?.getBoundingClientRect() ?? new DOMRect(),
          });
          return;
        }
        const node = nodes.find((entry) => entry.id === nodeId);
        if (!node) {
          return;
        }
        const el = document.querySelector(`[data-id="${nodeId}"]`);
        const rect = el?.getBoundingClientRect() ?? new DOMRect();
        setFocusedNode({
          id: nodeId,
          type: node.type ?? 'extension',
          data: (node.data ?? {}) as Record<string, unknown>,
          rect,
        });
      },
      closeDetail: async () => {
        useCanvasStore.getState().setFocusedNode(null);
      },
      requestTitleEdit: async () => {
        if (nodeId) {
          useCanvasStore.getState().setRenamingNodeId(nodeId);
        }
      },
    },
    assets: {
      importFile: async (options) => {
        const file = await pickFiles(options?.accept);
        if (!file) {
          return null;
        }
        try {
          const saved = await saveAssetFileWithProgressToast(file);
          if (!saved.attachmentFile) {
            return null;
          }
          importedAssetMetadata.set(
            saved.attachmentFile,
            metadataFromSavedAsset(saved)
          );
          return { id: saved.attachmentFile };
        } catch {
          return null;
        }
      },
      getUrl: async (assetId) => {
        const loaded = await rpcLoadAttachment(assetId);
        if (!loaded?.dataUrl) {
          throw new Error('Unable to load attachment.');
        }
        return loaded.dataUrl;
      },
      getMetadata: async (assetId) => {
        const cached = importedAssetMetadata.get(assetId);
        if (cached) {
          return cached;
        }
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
      reveal: async (assetId) => {
        const result = await rpcRevealAttachment(assetId);
        if (!result?.success) {
          toast(m.toast_reveal_failed());
        }
      },
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
          const result = await rpcOpenExternalUrl(normalized);
          if (!result?.success) {
            toast(m.toast_open_link_failed());
          }
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
