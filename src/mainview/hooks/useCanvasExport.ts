import type { ReactFlowInstance } from '@xyflow/react';
import type { RefObject } from 'react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  exportReactFlowCanvasToJson,
  exportReactFlowCanvasToPng,
  sanitizeExportFileName,
} from '@/lib/canvasExport';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { useWidgetStore } from '@/store/widgetStore';
import * as m from '../../paraglide/messages.js';

/** PNG / JSON export of the active canvas view. */
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
  }, [activeViewName, canvasBackground, rfInstance]);

  const onExportCanvasJson = useCallback(async () => {
    const instance = rfInstance.current;
    if (!instance) {
      toast.error(m.toast_canvas_not_ready());
      return;
    }

    try {
      const { nodes: currentNodes, edges: currentEdges } =
        useCanvasStore.getState();
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

  return { onExportCanvas, onExportCanvasJson };
}
