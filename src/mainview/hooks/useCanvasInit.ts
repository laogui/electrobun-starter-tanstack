import type { Edge, Node } from '@xyflow/react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { initialEdges, initialNodes } from '@/data/initialNodes';
import { sanitizeForPersistence } from '@/lib/canvasNodeSerialization';
import { confirmCanvasRecovery } from '@/lib/confirmCanvasRecovery';
import { queryClient } from '@/lib/queryClient';
import {
  isRpcAvailable,
  loadCanvas,
  rpcConfirmCanvasRecovery,
  rpcListViews,
  rpcSaveManifest,
} from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import type { CanvasLoadError } from '@/store/slices/persistenceSlice';
import * as m from '../../paraglide/messages.js';
import { collectExtensionInstanceIds } from '../../shared/extensions/refs';

/** View id seeded with demo content when its manifest does not exist yet. */
const FIRST_RUN_VIEW_ID = 'default';
const CORRUPT_ERROR_RE = /corrupt/i;

function classifyLoadError(error: unknown): CanvasLoadError['kind'] {
  const text =
    error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return CORRUPT_ERROR_RE.test(text) ? 'corrupt' : 'failed';
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

/**
 * Load (or first-run seed) the active view's canvas into the stores whenever
 * the canvas is not hydrated: nodes/edges and extension instances. Stale loads are discarded when the
 * active view changes mid-flight.
 *
 * A load that fails (corrupt manifest, RPC error, unknown view) sets
 * `canvasLoadError` and leaves the canvas un-hydrated, so nothing is ever
 * persisted over the unreadable file. Only the genuinely first-run default
 * canvas (listed in the workspace but without a manifest yet) is seeded.
 */
export function useCanvasInit(): void {
  const hydrate = useCanvasStore((s) => s.hydrate);
  const hydrated = useCanvasStore((s) => s._hydrated);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const canvasLoadError = useCanvasStore((s) => s.canvasLoadError);
  const setCanvasLoadError = useCanvasStore((s) => s.setCanvasLoadError);
  const setActiveView = useCanvasStore((s) => s.setActiveView);
  const setViews = useCanvasStore((s) => s.setViews);
  const hydrateExtensionInstances = useExtensionInstanceStore((s) => s.hydrate);

  useEffect(() => {
    if (hydrated || canvasLoadError) {
      return;
    }
    // Track whether this effect invocation has been superseded by a newer one
    // (e.g. activeViewId changed while loadCanvas was in flight). Without this,
    // a stale promise could hydrate the wrong canvas data.
    let cancelled = false;
    const fail = (kind: CanvasLoadError['kind'], message?: string) => {
      if (!cancelled) {
        setCanvasLoadError({ kind, message, viewId: activeViewId });
      }
    };

    // loadCanvas returned null: the view is unknown or its manifest is
    // missing. Seed only the first-run default canvas; redirect an unknown
    // view to the workspace's active one; anything else is an error.
    const handleMissing = async () => {
      const listed = (await rpcListViews()) as {
        activeViewId?: string;
        views?: Array<{ id: string; name: string }>;
      } | null;
      if (cancelled) {
        return;
      }
      const views = Array.isArray(listed?.views) ? listed.views : null;
      if (!views) {
        fail('failed');
        return;
      }
      setViews(views.map((v) => ({ id: v.id, name: v.name })));
      const listedHere = views.some((v) => v.id === activeViewId);
      if (!listedHere) {
        const fallback =
          views.find((v) => v.id === listed?.activeViewId) ?? views[0];
        if (fallback && fallback.id !== activeViewId) {
          setActiveView(fallback.id);
          return;
        }
        fail('missing');
        return;
      }
      if (activeViewId !== FIRST_RUN_VIEW_ID) {
        fail('missing');
        return;
      }
      // First run: seed workspace with initialNodes + initialEdges.
      // fitView frames the seed nodes; the user's first pan/zoom fills the
      // session camera cache for this view.
      const seededNodes = initialNodes;
      const sanitized = sanitizeForPersistence(seededNodes, initialEdges);
      const saved = await rpcSaveManifest(
        activeViewId,
        sanitized.nodes,
        sanitized.edges
      );
      if (!saved?.success) {
        fail('failed');
        return;
      }
      if (!cancelled) {
        hydrate(seededNodes, initialEdges);
        hydrateExtensionInstances({}, new Set());
      }
    };

    loadCanvas(activeViewId)
      .then(async (data) => {
        if (cancelled) {
          return;
        }
        if (data) {
          if (!(Array.isArray(data.nodes) && Array.isArray(data.edges))) {
            fail('corrupt');
            return;
          }
          if (
            data.recoveredFrom &&
            !(await confirmCanvasRecovery(
              m.canvas_disk_recovery_confirm({ source: data.recoveredFrom })
            ))
          ) {
            fail('corrupt');
            return;
          }
          if (cancelled) {
            return;
          }
          if (data.recoveredFrom) {
            if (
              !(
                data.recoveryToken &&
                (
                  await rpcConfirmCanvasRecovery(
                    activeViewId,
                    data.recoveryToken
                  )
                ).success
              )
            ) {
              fail('corrupt');
              return;
            }
            if (cancelled) {
              return;
            }
          }
          // Viewport is session-only; loadCanvas no longer carries camera state.
          hydrate(data.nodes as Node[], data.edges as Edge[]);
          if (data.loadIssues?.length) {
            toast.warning(
              m.canvas_isolated_records({ count: data.loadIssues.length }),
              {
                duration: Number.POSITIVE_INFINITY,
                id: `canvas-isolated-${activeViewId}`,
              }
            );
          }
          // Always hydrate (even when empty) so switching canvases prunes
          // records from the previous view.
          const referencedExtensionIds = new Set(
            collectExtensionInstanceIds(data.nodes)
          );
          hydrateExtensionInstances(
            data.extensionInstances ?? {},
            referencedExtensionIds
          );
          // Lazy legacy migration can change tag keys after the workspace
          // metadata query was cached on a different canvas.
          queryClient.invalidateQueries({ queryKey: ['node-metadata'] });
          queryClient.invalidateQueries({ queryKey: ['tags'] });
          if (typeof data.recoveredFrom === 'string' && data.recoveredFrom) {
            toast.warning(
              m.toast_canvas_recovered_from_backup({
                source: data.recoveredFrom,
              }),
              { duration: 10_000 }
            );
          }
        } else if (await isRpcAvailable()) {
          if (cancelled) {
            return;
          }
          await handleMissing();
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
          fail(classifyLoadError(error), errorMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    hydrate,
    hydrateExtensionInstances,
    hydrated,
    activeViewId,
    canvasLoadError,
    setCanvasLoadError,
    setActiveView,
    setViews,
  ]);
}
