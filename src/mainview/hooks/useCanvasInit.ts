import type { Node } from '@xyflow/react';

import { useEffect } from 'react';
import {
  initialEdges,
  initialNodes,
  initialWidgetSeeds,
} from '@/data/initialNodes';
import { collectWidgetIdsFromNodes } from '@/lib/canvasExport';
import { sanitizeForPersistence } from '@/lib/canvasNodeSerialization';
import {
  isRpcAvailable,
  loadCanvas,
  rpcListExtensionEnablement,
  rpcSaveManifest,
} from '@/lib/rpc';
import type { WidgetKind, WidgetRecord } from '@/lib/widgetTypes';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionEnablementStore } from '@/store/extensionEnablementStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { useWidgetStore, type WidgetStoreState } from '@/store/widgetStore';
import { collectExtensionInstanceIds } from '../../shared/extensions/refs';

async function materializeInitialWidgetSeeds(
  nodes: Node[],
  createWidgetRecord: (
    kind: WidgetKind,
    title?: string
  ) => Promise<WidgetRecord | null>,
  updateWidgetRecord: WidgetStoreState['updateWidget'],
  saveWidgetNow: WidgetStoreState['saveWidgetNow']
): Promise<Node[]> {
  const seededNodes: Node[] = [];
  for (const node of nodes) {
    if (node.type !== 'widget') {
      seededNodes.push(node);
      continue;
    }
    const seed = initialWidgetSeeds[node.id];
    if (!seed) {
      seededNodes.push(node);
      continue;
    }
    const existingWidgetId =
      typeof node.data.widgetId === 'string' ? node.data.widgetId : '';
    if (existingWidgetId) {
      seededNodes.push(node);
      continue;
    }

    const widget = await createWidgetRecord(seed.kind, seed.title);
    if (!widget) {
      throw new Error(`Failed to create initial widget for node ${node.id}.`);
    }
    updateWidgetRecord(
      widget.id,
      (current) => ({
        ...current,
        title: seed.title,
        data: seed.data,
        updatedAt: new Date().toISOString(),
      }),
      { recordHistory: false }
    );
    await saveWidgetNow(widget.id);

    seededNodes.push({
      ...node,
      data: {
        ...node.data,
        widgetId: widget.id,
        kind: widget.kind,
      },
    });
  }
  return seededNodes;
}

/**
 * Load (or first-run seed) the active view's canvas into the stores whenever
 * the canvas is not hydrated: nodes/edges, widget records, extension
 * instances and canvas-type enablement. Stale loads are discarded when the
 * active view changes mid-flight.
 */
export function useCanvasInit(): void {
  const hydrate = useCanvasStore((s) => s.hydrate);
  const hydrated = useCanvasStore((s) => s._hydrated);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const hydrateWidgets = useWidgetStore((s) => s.hydrate);
  const createWidgetRecord = useWidgetStore((s) => s.createWidget);
  const updateWidgetRecord = useWidgetStore((s) => s.updateWidget);
  const saveWidgetNow = useWidgetStore((s) => s.saveWidgetNow);
  const hydrateExtensionInstances = useExtensionInstanceStore((s) => s.hydrate);
  const hydrateExtensionEnablement = useExtensionEnablementStore(
    (s) => s.hydrate
  );

  useEffect(() => {
    if (hydrated) {
      return;
    }
    // Track whether this effect invocation has been superseded by a newer one
    // (e.g. activeViewId changed while loadCanvas was in flight). Without this,
    // a stale promise could hydrate the wrong canvas data.
    let cancelled = false;
    loadCanvas(activeViewId)
      .then(async (data) => {
        if (cancelled) {
          return;
        }
        const enablement = await rpcListExtensionEnablement();
        if (cancelled) {
          return;
        }
        hydrateExtensionEnablement(enablement.disabledCanvasTypes);
        if (data) {
          // Viewport is session-only; loadCanvas no longer carries camera state.
          hydrate(data.nodes, data.edges);
          // Always hydrate (even when widgets is absent/empty) so switching to
          // a canvas with zero widgets still prunes records from the previous
          // view. Pass the referenced id set so unreferenced entries are dropped.
          const referencedWidgetIds = new Set(
            collectWidgetIdsFromNodes(data.nodes)
          );
          hydrateWidgets(data.widgets ?? {}, referencedWidgetIds);
          const referencedExtensionIds = new Set(
            collectExtensionInstanceIds(data.nodes)
          );
          hydrateExtensionInstances(
            data.extensionInstances ?? {},
            referencedExtensionIds
          );
        } else if (await isRpcAvailable()) {
          if (cancelled) {
            return;
          }
          // First run: seed workspace with initialNodes + initialEdges.
          // fitView frames the seed nodes; the user's first pan/zoom fills the
          // session camera cache for this view.
          const seededNodes = await materializeInitialWidgetSeeds(
            initialNodes,
            createWidgetRecord,
            updateWidgetRecord,
            saveWidgetNow
          );
          const sanitized = sanitizeForPersistence(seededNodes, initialEdges);
          await rpcSaveManifest(activeViewId, sanitized.nodes, sanitized.edges);
          if (!cancelled) {
            hydrate(seededNodes, initialEdges);
            hydrateExtensionInstances({}, new Set());
          }
        } else {
          // Browser/dev fallback (no Electrobun RPC): hydrate in-memory with
          // the initial data so the canvas is usable for debugging without persistence.
          hydrate(initialNodes, initialEdges);
          hydrateExtensionInstances({}, new Set());
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[persistence] Failed to load canvas:', error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    hydrate,
    hydrateWidgets,
    hydrateExtensionEnablement,
    hydrateExtensionInstances,
    hydrated,
    activeViewId,
    createWidgetRecord,
    updateWidgetRecord,
    saveWidgetNow,
  ]);
}
