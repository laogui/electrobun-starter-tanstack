import { useStore } from '@xyflow/react';
import { createContext, type ReactNode, use } from 'react';

/**
 * Zoom threshold below which nodes render their simplified "zoomed-out"
 * placeholder. Kept here so the value lives next to its single source of truth.
 */
export const ZOOMED_OUT_THRESHOLD = 0.4;

const ZoomLevelContext = createContext(false);

/**
 * Broadcasts a single `isZoomedOut` boolean to every canvas node.
 *
 * Each node used to call `useViewport()` directly, which re-renders the
 * subscriber on every pan/zoom frame — so panning the canvas re-rendered all
 * nodes continuously. This provider subscribes to the React Flow store with a
 * boolean selector instead: React Flow only notifies subscribers when the
 * selected value changes, so the provider (and therefore the nodes) only
 * re-render when the zoom crosses {@link ZOOMED_OUT_THRESHOLD}.
 *
 * Must be rendered inside a `ReactFlowProvider` (it reads the flow store).
 */
export function ZoomLevelProvider({ children }: { children: ReactNode }) {
  const isZoomedOut = useStore(
    (state) => state.transform[2] < ZOOMED_OUT_THRESHOLD
  );
  return (
    <ZoomLevelContext.Provider value={isZoomedOut}>
      {children}
    </ZoomLevelContext.Provider>
  );
}

/** Returns whether the canvas is currently zoomed out past the threshold. */
export function useIsZoomedOut(): boolean {
  return use(ZoomLevelContext);
}
