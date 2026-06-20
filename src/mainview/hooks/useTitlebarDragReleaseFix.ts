import { useEffect } from 'react';

function isElectrobunDragRegion(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    !!target.closest('.electrobun-webkit-app-region-drag') &&
    !target.closest('.electrobun-webkit-app-region-no-drag')
  );
}

function sendStopWindowMove(): void {
  const bridge = (globalThis as any).__electrobunInternalBridge;
  const windowId = (globalThis as any).__electrobunWindowId;
  if (!bridge || windowId == null) {
    return;
  }

  bridge.postMessage(
    JSON.stringify([
      JSON.stringify({
        type: 'message',
        id: 'stopWindowMove',
        payload: { id: windowId },
      }),
    ])
  );
}

/** Electrobun preload only calls stopWindowMove when mouseup is on the drag region. */
export function useTitlebarDragReleaseFix() {
  useEffect(() => {
    let dragging = false;

    const stop = () => {
      if (!dragging) {
        return;
      }
      dragging = false;
      sendStopWindowMove();
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      if (isElectrobunDragRegion(event.target)) {
        dragging = true;
      }
    };

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseup', stop, true);
    window.addEventListener('blur', stop);

    return () => {
      stop();
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mouseup', stop, true);
      window.removeEventListener('blur', stop);
    };
  }, []);
}
