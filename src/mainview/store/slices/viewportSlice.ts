import type { StateCreator } from 'zustand';
import { shouldPersistViewport } from '@/lib/viewportPersist';
import type { CanvasState, CanvasViewport } from '../canvasStore';

export interface ViewportSlice {
  /**
   * Per-view session camera cache. Survives view switches within the process;
   * cleared on full reset / app quit (never disk-backed).
   */
  _sessionViewports: Record<string, CanvasViewport>;
  /**
   * User-confirmed camera for the active view. Session-only (in-memory):
   * restored when re-entering a view in the same app session; cold start fits
   * the canvas to the window instead. Never written to disk.
   */
  sessionViewport: CanvasViewport | null;
  setViewport: (
    viewport: CanvasViewport | null,
    options?: { persist?: boolean }
  ) => void;

  /**
   * Live React Flow camera — may differ from sessionViewport after
   * programmatic moves (search jump, focus, export fit).
   */
  viewport: CanvasViewport | null;
}

export const createViewportSlice: StateCreator<
  CanvasState,
  [],
  [],
  ViewportSlice
> = (set, get) => ({
  viewport: null,
  sessionViewport: null,
  _sessionViewports: {},

  setViewport: (viewport, options) => {
    // `persist` means "remember in the session cache", not disk.
    const persist = options?.persist ?? shouldPersistViewport();
    const {
      activeViewId,
      viewport: current,
      sessionViewport: currentSession,
      _sessionViewports,
    } = get();
    const viewportUnchanged =
      current?.x === viewport?.x &&
      current?.y === viewport?.y &&
      current?.zoom === viewport?.zoom;
    const sessionUnchanged =
      !persist ||
      (currentSession?.x === viewport?.x &&
        currentSession?.y === viewport?.y &&
        currentSession?.zoom === viewport?.zoom);

    if (viewportUnchanged && sessionUnchanged) {
      return;
    }

    if (!persist) {
      set({ viewport });
      return;
    }

    const nextSessionMap = { ..._sessionViewports };
    if (viewport) {
      nextSessionMap[activeViewId] = viewport;
    } else {
      delete nextSessionMap[activeViewId];
    }

    set({
      viewport,
      sessionViewport: viewport,
      _sessionViewports: nextSessionMap,
    });
  },
});
