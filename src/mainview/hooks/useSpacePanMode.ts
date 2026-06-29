import { useEffect, useRef, useState } from 'react';

function isSpaceKey(event: KeyboardEvent): boolean {
  return (
    event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar'
  );
}

function isEditableElement(target: EventTarget | Element | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest('input, textarea, select')) {
    return true;
  }
  for (let el: Element | null = target; el; el = el.parentElement) {
    const contentEditable = el.getAttribute('contenteditable');
    if (
      el instanceof HTMLElement &&
      (el.isContentEditable ||
        el.contentEditable === 'true' ||
        el.contentEditable === 'plaintext-only' ||
        contentEditable === 'true' ||
        contentEditable === 'plaintext-only')
    ) {
      return true;
    }
  }
  return false;
}

export function useSpacePanMode(): boolean {
  const [spacePanActive, setSpacePanActive] = useState(false);
  const spacePanActiveRef = useRef(false);

  useEffect(() => {
    const setActive = (next: boolean) => {
      spacePanActiveRef.current = next;
      setSpacePanActive(next);
    };

    const shouldIgnore = (event: KeyboardEvent) =>
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      isEditableElement(event.target) ||
      isEditableElement(document.activeElement);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSpaceKey(event)) {
        return;
      }
      if (spacePanActiveRef.current) {
        event.preventDefault();
        return;
      }
      if (shouldIgnore(event)) {
        return;
      }
      event.preventDefault();
      setActive(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isSpaceKey(event)) {
        setActive(false);
      }
    };

    const handleBlur = () => {
      setActive(false);
    };

    const handleEditablePointerDown = (event: PointerEvent | MouseEvent) => {
      if (!(spacePanActiveRef.current && isEditableElement(event.target))) {
        return;
      }
      event.preventDefault();
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    globalThis.addEventListener('keyup', handleKeyUp);
    globalThis.addEventListener('blur', handleBlur);
    globalThis.addEventListener('pointerdown', handleEditablePointerDown, true);
    globalThis.addEventListener('mousedown', handleEditablePointerDown, true);

    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      globalThis.removeEventListener('keyup', handleKeyUp);
      globalThis.removeEventListener('blur', handleBlur);
      globalThis.removeEventListener(
        'pointerdown',
        handleEditablePointerDown,
        true
      );
      globalThis.removeEventListener(
        'mousedown',
        handleEditablePointerDown,
        true
      );
    };
  }, []);

  return spacePanActive;
}

export function useEditableInteractionLock(): boolean {
  const [editableActive, setEditableActive] = useState(() =>
    typeof document === 'undefined'
      ? false
      : isEditableElement(document.activeElement)
  );

  useEffect(() => {
    let focusOutTimer: number | undefined;

    const clearFocusOutTimer = () => {
      if (focusOutTimer === undefined) {
        return;
      }
      window.clearTimeout(focusOutTimer);
      focusOutTimer = undefined;
    };

    const handleFocusIn = (event: FocusEvent) => {
      clearFocusOutTimer();
      setEditableActive(isEditableElement(event.target));
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget) {
        clearFocusOutTimer();
        setEditableActive(isEditableElement(event.relatedTarget));
        return;
      }
      clearFocusOutTimer();
      focusOutTimer = window.setTimeout(() => {
        setEditableActive(isEditableElement(document.activeElement));
      }, 0);
    };

    const handleWindowBlur = () => {
      clearFocusOutTimer();
      setEditableActive(false);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    globalThis.addEventListener('blur', handleWindowBlur);

    return () => {
      clearFocusOutTimer();
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      globalThis.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  return editableActive;
}
