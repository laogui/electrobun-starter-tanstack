import { useCallback, useRef } from 'react';

interface TouchDragState {
  isDown: boolean;
  startX: number;
  startY: number;
  scrollLeft: number;
  hasDragged: boolean;
}

interface LongPressState {
  timer: number | null;
  startX: number;
  startY: number;
}

const DRAG_THRESHOLD = 5; // pixels
const LONG_PRESS_DURATION = 500; // milliseconds
const MOVEMENT_THRESHOLD = 10; // pixels for canceling long press

/**
 * Hook for handling touch drag gestures (pan/scroll)
 * Supports both mouse and touch events for horizontal scrolling
 */
export function useTouchDrag(scrollRef: React.RefObject<HTMLElement>) {
  const dragState = useRef<TouchDragState>({
    isDown: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    hasDragged: false,
  });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;

    dragState.current = {
      isDown: true,
      startX: e.pageX,
      startY: e.pageY,
      scrollLeft: el.scrollLeft,
      hasDragged: false,
    };

    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
    el.style.touchAction = 'none';
  }, [scrollRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.isDown) return;

    const el = scrollRef.current;
    if (!el) return;

    const dx = e.pageX - dragState.current.startX;

    if (Math.abs(dx) > DRAG_THRESHOLD) {
      e.preventDefault();
      dragState.current.hasDragged = true;
    }

    el.scrollLeft = dragState.current.scrollLeft - dx * 1.2;
  }, [scrollRef]);

  const handlePointerUp = useCallback(() => {
    dragState.current.isDown = false;
    const el = scrollRef.current;
    if (el) {
      el.style.cursor = '';
      el.style.userSelect = '';
      el.style.touchAction = '';
    }
  }, [scrollRef]);

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (dragState.current.hasDragged) {
      e.stopPropagation();
      e.preventDefault();
      dragState.current.hasDragged = false;
    }
  }, []);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleClickCapture,
    hasDragged: () => dragState.current.hasDragged,
  };
}

/**
 * Hook for handling long-press gestures (e.g., for context menus)
 * Works with both mouse and touch events
 */
export function useLongPress(
  onLongPress: (e: React.PointerEvent) => void,
  onCancel?: () => void,
) {
  const longPressState = useRef<LongPressState>({
    timer: null,
    startX: 0,
    startY: 0,
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Clear any existing timer
      if (longPressState.current.timer) {
        window.clearTimeout(longPressState.current.timer);
      }

      longPressState.current.startX = e.clientX;
      longPressState.current.startY = e.clientY;

      // Start long press timer
      longPressState.current.timer = window.setTimeout(() => {
        onLongPress(e);
        longPressState.current.timer = null;
      }, LONG_PRESS_DURATION);
    },
    [onLongPress],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!longPressState.current.timer) return;

      const dx = e.clientX - longPressState.current.startX;
      const dy = e.clientY - longPressState.current.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Cancel long press if moved too far
      if (distance > MOVEMENT_THRESHOLD) {
        window.clearTimeout(longPressState.current.timer);
        longPressState.current.timer = null;
        onCancel?.();
      }
    },
    [onCancel],
  );

  const handlePointerUp = useCallback(() => {
    if (longPressState.current.timer) {
      window.clearTimeout(longPressState.current.timer);
      longPressState.current.timer = null;
    }
  }, []);

  const handlePointerCancel = useCallback(() => {
    if (longPressState.current.timer) {
      window.clearTimeout(longPressState.current.timer);
      longPressState.current.timer = null;
      onCancel?.();
    }
  }, [onCancel]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}

/**
 * Detect if the current device supports touch
 */
export function isTouchDevice(): boolean {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-expect-error - msMaxTouchPoints is not in standard TypeScript types
    navigator.msMaxTouchPoints > 0
  );
}
