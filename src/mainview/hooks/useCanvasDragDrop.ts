import type { ReactFlowInstance } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import type { RefObject } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { canvasTypeRegistry } from '@/extensions/registry';
import { saveAssetFileWithProgressToast } from '@/lib/assetImportProgress';
import type { CanvasExportDocument } from '@/lib/canvasExport';
import {
  buildImportedCanvasPayload,
  collectExtensionInstanceIdsFromCanvasExport,
  collectWidgetIdsFromCanvasExport,
} from '@/lib/canvasImport';
import { sortNodesByParent } from '@/lib/canvasUtils';
import { createLinkNodeData, extractLinkUrl } from '@/lib/contentTypes';
import {
  computeImageNodeSize,
  createImageDropPreview,
  isImageFile,
  isOsFileDrag,
  persistImportedImageFiles,
  readCanvasExportJsonFile,
  readImageNaturalSize,
  revokeImageDropPreview,
} from '@/lib/importCanvasFiles';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import * as m from '../../paraglide/messages.js';
import {
  FILE_CANVAS_TYPE_ID,
  IMAGE_CANVAS_TYPE_ID,
  LINK_CANVAS_TYPE_ID,
} from '../../shared/extensions/builtinIds';
import {
  normalizeFileState,
  normalizeImageState,
} from '../../shared/extensions/media/state';
import { normalizeLinkState } from '../../shared/extensions/web/link';

const ASSET_DROP_GRID_COLS = 3;
const ASSET_DROP_GRID_GAP = 180;

function getDroppedText(dataTransfer: DataTransfer | null): string {
  if (!dataTransfer) {
    return '';
  }
  return (
    dataTransfer.getData('text/uri-list') ||
    dataTransfer.getData('text/plain') ||
    dataTransfer.getData('text')
  );
}

function getDroppedFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer?.files?.length) {
    return [];
  }
  return Array.from(dataTransfer.files).filter((file) => file.size >= 0);
}

export interface CanvasDragUiPatch {
  dragPos?: { x: number; y: number } | null;
  isDraggingFile?: boolean;
}

/**
 * Canvas drag & drop + file/link ingestion: OS file drops become image/file
 * cards (or a canvas JSON import), dropped/pasted URLs become link cards, and
 * library notes dragged from the sidebar are pinned at the drop point.
 * `setDragUi` receives the drop-overlay state patches.
 */
export function useCanvasDragDrop({
  rfInstance,
  setDragUi,
}: {
  rfInstance: RefObject<ReactFlowInstance<any, any> | null>;
  setDragUi: (patch: CanvasDragUiPatch) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const createExtensionNode = useCanvasStore((s) => s.createExtensionNode);
  const pinNoteToCanvas = useCanvasStore((s) => s.pinNoteToCanvas);
  const createExtensionInstance = useExtensionInstanceStore(
    (s) => s.createInstance
  );

  const createLinkFromText = useCallback(
    async (
      text: string,
      options?: { anchorCenter?: { x: number; y: number } }
    ): Promise<boolean> => {
      const url = extractLinkUrl(text);
      if (!url) {
        return false;
      }
      const data = createLinkNodeData(url);
      if (!data) {
        return false;
      }
      const state = normalizeLinkState(data);
      const def = canvasTypeRegistry.get(LINK_CANVAS_TYPE_ID);
      if (!def) {
        return false;
      }
      const record = await createExtensionInstance({
        canvasTypeId: LINK_CANVAS_TYPE_ID,
        dataVersion: def.dataVersion,
        presentation: def.buildPresentation(state),
        state,
      });
      if (!record) {
        return false;
      }
      await createExtensionNode(
        LINK_CANVAS_TYPE_ID,
        record.id,
        rfInstance.current,
        {
          size: def.surface.defaultSize,
          ...(options?.anchorCenter
            ? { anchorCenter: options.anchorCenter }
            : {}),
        }
      );
      return true;
    },
    [createExtensionInstance, createExtensionNode, rfInstance]
  );

  const importCanvasExportDocument = useCallback(
    async (
      document_: CanvasExportDocument,
      anchorCenter: { x: number; y: number }
    ) => {
      // Checklist / Pomodoro / Reminder widgets were retired; widget nodes
      // in an imported file are dropped (an empty id map drops them all).
      const widgetIdMap = new Map<string, string>();
      const skippedWidgetCount =
        collectWidgetIdsFromCanvasExport(document_).length;

      const instanceIdMap = new Map<string, string>();
      const exportedInstances = document_.extensionInstances ?? {};
      for (const sourceId of collectExtensionInstanceIdsFromCanvasExport(
        document_
      )) {
        const source = exportedInstances[sourceId];
        if (!source) {
          continue;
        }
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const created = await createExtensionInstance({
          canvasTypeId: source.canvasTypeId,
          dataVersion: source.dataVersion,
          presentation: source.presentation,
          state: source.state,
        });
        if (created) {
          instanceIdMap.set(sourceId, created.id);
        }
      }

      const state = useCanvasStore.getState();
      const imported = buildImportedCanvasPayload(
        document_,
        anchorCenter,
        state.nodes,
        state.edges,
        widgetIdMap,
        instanceIdMap
      );
      if (imported.nodes.length === 0) {
        toast.error(m.toast_canvas_json_empty());
        return;
      }
      const latest = useCanvasStore.getState();
      latest.saveSnapshot();
      latest.setNodes((prev) =>
        sortNodesByParent([
          ...prev.map((node) => ({ ...node, selected: false })),
          ...imported.nodes,
        ])
      );
      latest.setEdges((prev) => [...prev, ...imported.edges]);
      if (skippedWidgetCount > 0) {
        toast.warning(
          m.toast_canvas_json_widgets_skipped({ count: skippedWidgetCount })
        );
      } else {
        toast.success(m.toast_canvas_json_imported());
      }
    },
    [createExtensionInstance]
  );

  const createAssetsFromFiles = useCallback(
    async (files: File[], anchorCenter: { x: number; y: number }) => {
      for (const [index, file] of files.entries()) {
        const col = index % ASSET_DROP_GRID_COLS;
        const row = Math.floor(index / ASSET_DROP_GRID_COLS);
        const position = {
          x: anchorCenter.x + col * ASSET_DROP_GRID_GAP,
          y: anchorCenter.y + row * ASSET_DROP_GRID_GAP,
        };

        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const canvasExportDocument = await readCanvasExportJsonFile(file);
        if (canvasExportDocument) {
          try {
            // Keep dropped files inserted in visual grid order.
            // react-doctor-disable-next-line react-doctor/async-await-in-loop
            await importCanvasExportDocument(canvasExportDocument, position);
          } catch (error) {
            console.error('[canvas] Failed to import canvas JSON:', error);
            toast.error(m.toast_canvas_json_import_failed());
          }
          continue;
        }

        if (isImageFile(file)) {
          const preview = createImageDropPreview(file);
          // Size the card to the image's aspect ratio (clamped) before it is
          // created, so the thumbnail shows in full. A failed read falls back
          // to the registry default size.
          // react-doctor-disable-next-line react-doctor/async-await-in-loop
          const naturalSize = await readImageNaturalSize(preview.imageUrl);
          const size = naturalSize
            ? computeImageNodeSize(naturalSize.width, naturalSize.height)
            : undefined;
          try {
            // Keep dropped files inserted in visual grid order.
            // react-doctor-disable-next-line react-doctor/async-await-in-loop
            const persisted = await persistImportedImageFiles(file);
            const def = canvasTypeRegistry.get(IMAGE_CANVAS_TYPE_ID);
            const state = normalizeImageState({
              title: persisted.title || preview.title,
              color: '#FFFFFF',
              imageFile: persisted.imageFile,
              thumbnailFile: persisted.thumbnailFile,
            });
            if (def) {
              const record = await createExtensionInstance({
                canvasTypeId: IMAGE_CANVAS_TYPE_ID,
                dataVersion: def.dataVersion,
                presentation: def.buildPresentation(state),
                state,
              });
              if (record) {
                await createExtensionNode(
                  IMAGE_CANVAS_TYPE_ID,
                  record.id,
                  rfInstance.current,
                  {
                    ...(size ? { size } : { size: def.surface.defaultSize }),
                    anchorCenter: position,
                  }
                );
              }
            }
            revokeImageDropPreview(preview.imageUrl);
          } catch (error) {
            revokeImageDropPreview(preview.imageUrl);
            console.error('[canvas] Failed to import dropped image:', error);
          }
          continue;
        }

        try {
          // Keep dropped files inserted in visual grid order.
          // react-doctor-disable-next-line react-doctor/async-await-in-loop
          const data = await saveAssetFileWithProgressToast(file);
          const def = canvasTypeRegistry.get(FILE_CANVAS_TYPE_ID);
          const state = normalizeFileState(data);
          if (def) {
            const record = await createExtensionInstance({
              canvasTypeId: FILE_CANVAS_TYPE_ID,
              dataVersion: def.dataVersion,
              presentation: def.buildPresentation(state),
              state,
            });
            if (record) {
              await createExtensionNode(
                FILE_CANVAS_TYPE_ID,
                record.id,
                rfInstance.current,
                {
                  size: def.surface.defaultSize,
                  anchorCenter: position,
                }
              );
            }
          }
        } catch (error) {
          console.error('[canvas] Failed to import dropped file:', error);
        }
      }
    },
    [
      createExtensionInstance,
      createExtensionNode,
      importCanvasExportDocument,
      rfInstance,
    ]
  );

  const dragDepthRef = useRef(0);
  // Cursor position (screen coords) for the drop ghost; rAF-throttled because
  // `dragover` fires very frequently.
  const dragRafRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (dragRafRef.current != null) {
        cancelAnimationFrame(dragRafRef.current);
      }
    },
    []
  );

  const onDragEnterWindow = useCallback(
    (e: React.DragEvent) => {
      // Only react to OS file drags — internal drags (library notes / detached
      // chips) leave 'Files' off the dataTransfer types list on some platforms.
      if (!isOsFileDrag(e.dataTransfer)) {
        return;
      }
      dragDepthRef.current += 1;
      setDragUi({ isDraggingFile: true });
    },
    [setDragUi]
  );

  const onDragLeaveWindow = useCallback(() => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragUi({ dragPos: null, isDraggingFile: false });
    }
  }, [setDragUi]);

  const onDropCanvas = useCallback(
    (e: React.DragEvent | DragEvent) => {
      // Reset overlay state on drop regardless of payload.
      dragDepthRef.current = 0;
      setDragUi({ dragPos: null, isDraggingFile: false });
      const dataTransfer = (e as React.DragEvent).dataTransfer;
      const position = screenToFlowPosition({
        x: (e as React.DragEvent).clientX,
        y: (e as React.DragEvent).clientY,
      });
      const nodeId = dataTransfer?.getData(
        'application/ghostboard-detached-note'
      );
      if (nodeId) {
        e.preventDefault();
        pinNoteToCanvas(nodeId, position);
        return;
      }

      const files = getDroppedFiles(dataTransfer ?? null);
      if (files.length > 0) {
        e.preventDefault();
        createAssetsFromFiles(files, position);
        return;
      }

      // Same as the paste handler: gate synchronously on the URL extractor.
      // The previous `if (createLinkFromText(...))` check was effectively a
      // no-op because the async function always returned a truthy Promise.
      const text = getDroppedText(dataTransfer ?? null);
      if (extractLinkUrl(text)) {
        e.preventDefault();
        createLinkFromText(text, { anchorCenter: position }).catch((error) => {
          console.error('[canvas] Failed to create dropped link:', error);
        });
      }
    },
    [
      createAssetsFromFiles,
      createLinkFromText,
      pinNoteToCanvas,
      screenToFlowPosition,
      setDragUi,
    ]
  );

  const onDragOverCanvas = useCallback(
    (e: React.DragEvent | DragEvent) => {
      e.preventDefault();
      const { clientX, clientY } = e as React.DragEvent;
      if (dragRafRef.current == null) {
        dragRafRef.current = requestAnimationFrame(() => {
          dragRafRef.current = null;
          setDragUi({ dragPos: { x: clientX, y: clientY } });
        });
      }
      const dataTransfer = (e as React.DragEvent).dataTransfer;
      if (dataTransfer) {
        const hasFilePayload = isOsFileDrag(dataTransfer);
        if (hasFilePayload) {
          setDragUi({ isDraggingFile: true });
        }
        const types = Array.from(dataTransfer.types);
        const hasLinkPayload =
          types.includes('text/uri-list') ||
          types.includes('text/plain') ||
          types.includes('text');
        dataTransfer.dropEffect =
          hasFilePayload || hasLinkPayload ? 'copy' : 'move';
      }
    },
    [setDragUi]
  );

  return {
    createAssetsFromFiles,
    createLinkFromText,
    onDragEnterWindow,
    onDragLeaveWindow,
    onDragOverCanvas,
    onDropCanvas,
  };
}
