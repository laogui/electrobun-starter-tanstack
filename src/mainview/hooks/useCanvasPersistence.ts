import { useEffect, useRef } from 'react';

import { isRpcAvailable, rpcSaveManifest } from '@/lib/rpc';
import { sanitizeForPersistence } from '@/lib/sanitize';
import { useCanvasStore } from '@/store/canvasStore';

const LAYOUT_DEBOUNCE_MS = 2500;

export function useCanvasPersistence() {
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAvailable = useRef<boolean | null>(null);

  useEffect(() => {
    isRpcAvailable().then((available) => {
      isAvailable.current = available;
    });

    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (state.nodes === prevState.nodes && state.edges === prevState.edges)
        return;
      if (!isAvailable.current) return;

      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
      }
      pendingTimer.current = setTimeout(() => {
        const { nodes, edges } = useCanvasStore.getState();
        const sanitized = sanitizeForPersistence(nodes, edges);
        rpcSaveManifest('default', sanitized.nodes, sanitized.edges).catch(
          (error) => {
            console.error('[persistence] Failed to save manifest:', error);
          }
        );
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
      rpcSaveManifest('default', sanitized.nodes, sanitized.edges).catch(
        (error) => {
          console.error('[persistence] Failed to flush manifest:', error);
        }
      );
    };
    window.addEventListener('blur', handleBlur);

    return () => {
      unsub();
      window.removeEventListener('blur', handleBlur);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, []);
}
