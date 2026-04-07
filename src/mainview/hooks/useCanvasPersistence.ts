import { useEffect, useRef } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import { sanitizeForPersistence } from '@/lib/sanitize';
import { rpcSaveManifest, isRpcAvailable } from '@/lib/rpc';

const LAYOUT_DEBOUNCE_MS = 2500;

export function useCanvasPersistence() {
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAvailable = useRef<boolean | null>(null);

  useEffect(() => {
    isRpcAvailable().then((available) => {
      isAvailable.current = available;
    });

    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (state.nodes === prevState.nodes && state.edges === prevState.edges) return;
      if (!isAvailable.current) return;

      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
      }
      pendingTimer.current = setTimeout(() => {
        const { nodes, edges } = useCanvasStore.getState();
        const sanitized = sanitizeForPersistence(nodes, edges);
        rpcSaveManifest('default', sanitized.nodes, sanitized.edges).catch((err) => {
          console.error('[persistence] Failed to save manifest:', err);
        });
      }, LAYOUT_DEBOUNCE_MS);
    });

    const handleBlur = () => {
      if (!isAvailable.current) return;
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
      const { nodes, edges } = useCanvasStore.getState();
      const sanitized = sanitizeForPersistence(nodes, edges);
      rpcSaveManifest('default', sanitized.nodes, sanitized.edges).catch((err) => {
        console.error('[persistence] Failed to flush manifest:', err);
      });
    };
    window.addEventListener('blur', handleBlur);

    return () => {
      unsub();
      window.removeEventListener('blur', handleBlur);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, []);
}
