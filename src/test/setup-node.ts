import { afterEach, vi } from 'vitest';

if (!globalThis.Bun) {
  vi.stubGlobal('Bun', {
    file: vi.fn(),
    write: vi.fn(),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
