import type { ReactFlowInstance } from '@xyflow/react';
import type { RefObject } from 'react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  exportReactFlowCanvasToJson,
  exportReactFlowCanvasToPng,
  sanitizeExportFileName,
} from '@/lib/canvasExport';
import { flushRegisteredCanvas } from '@/lib/canvasFlushRegistry';
import { collectNoteReferences } from '@/lib/noteReferences';
import { isRpcAvailable, rpcExportNotesMarkdown } from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { useWidgetStore } from '@/store/widgetStore';
import * as m from '../../paraglide/messages.js';

/** Export the active canvas or scoped Markdown after pending note saves finish. */
export function useCanvasExport({
  activeViewId,
  activeViewName,
  canvasBackground,
  rfInstance,
}: {
  activeViewId: string;
  activeViewName: string;
  canvasBackground: string;
  rfInstance: RefObject<ReactFlowInstance<any, any> | null>;
}) {
  const onExportCanvas = useCallback(async () => {
    const instance = rfInstance.current;
    if (!instance) {
      toast.error(m.toast_canvas_not_ready());
      return;
    }

    try {
      const generation = useCanvasStore.getState()._canvasGeneration;
      if ((await isRpcAvailable()) && !(await flushRegisteredCanvas())) {
        throw new Error(m.toast_export_unsaved());
      }
      const state = useCanvasStore.getState();
      if (
        state._canvasGeneration !== generation ||
        state.activeViewId !== activeViewId
      ) {
        throw new Error(m.toast_export_failed());
      }
      const exported = await exportReactFlowCanvasToPng({
        backgroundColor: canvasBackground,
        fileName: sanitizeExportFileName(activeViewName),
        instance,
      });
      if (exported) {
        toast.success(m.toast_png_exported());
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : m.toast_export_failed();
      toast.error(message);
    }
  }, [activeViewId, activeViewName, canvasBackground, rfInstance]);

  const onExportCanvasJson = useCallback(async () => {
    const instance = rfInstance.current;
    if (!instance) {
      toast.error(m.toast_canvas_not_ready());
      return;
    }

    try {
      const generation = useCanvasStore.getState()._canvasGeneration;
      if ((await isRpcAvailable()) && !(await flushRegisteredCanvas())) {
        throw new Error(m.toast_export_unsaved());
      }
      const state = useCanvasStore.getState();
      if (
        state._canvasGeneration !== generation ||
        state.activeViewId !== activeViewId
      ) {
        throw new Error(m.toast_export_failed());
      }
      const { nodes: currentNodes, edges: currentEdges } = state;
      const exported = await exportReactFlowCanvasToJson({
        edges: currentEdges,
        fileName: sanitizeExportFileName(activeViewName),
        nodes: currentNodes,
        viewId: activeViewId,
        viewName: activeViewName,
        viewport: instance.getViewport?.(),
        widgets: useWidgetStore.getState().records,
        extensionInstances: useExtensionInstanceStore.getState().records,
      });
      if (exported) {
        toast.success(m.toast_json_exported());
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : m.toast_export_failed();
      toast.error(message);
    }
  }, [activeViewId, activeViewName, rfInstance]);

  const onExportMarkdown = useCallback(
    async (scope: 'all' | 'selected' | 'view') => {
      try {
        if (!(await isRpcAvailable())) {
          throw new Error(m.toast_export_failed());
        }
        const generation = useCanvasStore.getState()._canvasGeneration;
        if (!(await flushRegisteredCanvas())) {
          throw new Error(m.toast_export_unsaved());
        }
        const state = useCanvasStore.getState();
        if (state._canvasGeneration !== generation) {
          throw new Error(m.toast_export_failed());
        }
        const selectedIds = new Set(
          state.nodes.filter((node) => node.selected).map((node) => node.id)
        );
        let changed = true;
        while (changed) {
          changed = false;
          for (const node of state.nodes) {
            if (
              node.parentId &&
              selectedIds.has(node.parentId) &&
              !selectedIds.has(node.id)
            ) {
              selectedIds.add(node.id);
              changed = true;
            }
          }
        }
        const noteIds =
          scope === 'selected'
            ? collectNoteReferences(
                state.nodes.filter((node) => selectedIds.has(node.id))
              )
            : undefined;
        if (scope === 'selected' && noteIds?.length === 0) {
          toast.info(m.toast_export_no_notes());
          return;
        }
        const result = await rpcExportNotesMarkdown(scope, {
          canvasGeneration: generation,
          viewId: state.activeViewId,
          noteIds,
        });
        if (result?.canceled) {
          return;
        }
        if (result?.failed) {
          toast.warning(
            m.toast_markdown_export_partial({
              count: result.exported ?? 0,
              failed: result.failed,
            }),
            { description: result.filePath }
          );
          return;
        }
        if (!result?.success) {
          throw new Error(m.toast_export_failed());
        }
        toast.success(
          m.toast_markdown_exported_count({ count: result.exported ?? 0 }),
          { description: result.filePath }
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : m.toast_export_failed()
        );
      }
    },
    []
  );

  return { onExportCanvas, onExportCanvasJson, onExportMarkdown };
}
