import { useSyncExternalStore } from '@ghostboard/sdk/react';
import { useEffect, useState } from 'react';
import { jsx } from 'react/jsx-runtime';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

export const reactIdentity = useState;
export const reactDomIdentity = flushSync;
export const createRootIdentity = createRoot;
let disposed = false;
const subscribe = () => () => {};
const snapshot = () => 'shared-hook';

export function wasDisposed() {
  return disposed;
}

export function Panel() {
  const [count, setCount] = useState(0);
  const value = useSyncExternalStore(subscribe, snapshot);
  useEffect(
    () => () => {
      disposed = true;
    },
    []
  );
  return jsx('button', {
    title: value,
    onClick: () => setCount((current) => current + 1),
    children: `count:${count}`,
  });
}
