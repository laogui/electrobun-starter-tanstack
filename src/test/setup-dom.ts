import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

function createMemoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
    removeItem: (key) => items.delete(key),
    setItem: (key, value) => items.set(String(key), String(value)),
  };
}

if (globalThis.window !== undefined) {
  // Node 26 installs a configurable localStorage accessor that returns
  // undefined unless --localstorage-file is provided. Replace it in jsdom so
  // browser-facing tests get the deterministic Storage API they expect.
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    value: createMemoryStorage(),
  });

  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  class ResizeObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }

  class IntersectionObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);

  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }

  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }

  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  }
}

afterEach(() => {
  if (globalThis.window !== undefined) {
    cleanup();
    globalThis.localStorage.clear();
  }
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
