import type { Edge, Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingFlushBackup } from './pendingFlushBackup';
import {
  archivePendingFlushBackup,
  clearPendingFlushBackup,
  deleteRecoveryArchive,
  listRecoveryArchives,
  readPendingFlushBackup,
  writePendingFlushBackup,
} from './pendingFlushBackup';

describe('pendingFlushBackup', () => {
  const testViewId = 'test-view-123';

  beforeEach(() => {
    // Mock localStorage for Node.js test environment
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      get length() {
        return Object.keys(store).length;
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) {
          delete store[key];
        }
      },
    });
  });

  afterEach(() => {
    clearPendingFlushBackup(testViewId);
    vi.unstubAllGlobals();
  });

  describe('writePendingFlushBackup', () => {
    it('writes a valid backup to localStorage', () => {
      const nodes: Node[] = [
        { id: '1', type: 'sticky', position: { x: 0, y: 0 }, data: {} },
      ];
      const edges: Edge[] = [{ id: 'e1', source: '1', target: '2' }];
      const viewport = { x: 100, y: 200, zoom: 1.5 };

      writePendingFlushBackup(testViewId, { nodes, edges, viewport });

      const raw = localStorage.getItem(
        `ghostboard.v1.pendingFlush.${testViewId}`
      );
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw!) as PendingFlushBackup;
      expect(parsed.nodes).toEqual(nodes);
      expect(parsed.edges).toEqual(edges);
      expect(parsed.viewport).toEqual(viewport);
      expect(typeof parsed.savedAt).toBe('number');
    });

    it('handles localStorage quota errors gracefully', () => {
      const originalLocalStorage = globalThis.localStorage;
      const mockLocalStorage = {
        getItem: (key: string) => originalLocalStorage.getItem(key),
        setItem: vi.fn(() => {
          throw new DOMException('QuotaExceededError');
        }),
        removeItem: (key: string) => originalLocalStorage.removeItem(key),
        clear: () => originalLocalStorage.clear(),
      };
      vi.stubGlobal('localStorage', mockLocalStorage);

      const nodes: Node[] = [
        { id: '1', type: 'sticky', position: { x: 0, y: 0 }, data: {} },
      ];
      const edges: Edge[] = [];

      expect(() =>
        writePendingFlushBackup(testViewId, { nodes, edges, viewport: null })
      ).not.toThrow();

      vi.unstubAllGlobals();
      vi.stubGlobal('localStorage', originalLocalStorage);
    });
  });

  describe('readPendingFlushBackup', () => {
    it('reads a previously written backup', () => {
      const nodes: Node[] = [
        { id: '1', type: 'sticky', position: { x: 0, y: 0 }, data: {} },
      ];
      const edges: Edge[] = [];

      writePendingFlushBackup(testViewId, { nodes, edges, viewport: null });
      const backup = readPendingFlushBackup(testViewId);

      expect(backup).not.toBeNull();
      expect(backup!.nodes).toEqual(nodes);
      expect(backup!.edges).toEqual(edges);
      expect(backup!.viewport).toBeNull();
    });

    it('reads and clears legacy unversioned backups', () => {
      const nodes: Node[] = [
        { id: '1', type: 'sticky', position: { x: 0, y: 0 }, data: {} },
      ];
      const edges: Edge[] = [];
      const legacyKey = ['ghostboard', 'pendingFlush', testViewId].join('.');

      localStorage.setItem(
        legacyKey,
        JSON.stringify({ nodes, edges, savedAt: Date.now(), viewport: null })
      );

      const backup = readPendingFlushBackup(testViewId);
      expect(backup).not.toBeNull();
      expect(backup!.nodes).toEqual(nodes);

      clearPendingFlushBackup(testViewId);
      expect(localStorage.getItem(legacyKey)).toBeNull();
    });

    it('returns null for missing backup', () => {
      const backup = readPendingFlushBackup('nonexistent-view');
      expect(backup).toBeNull();
    });

    it('clears and returns null for corrupted JSON', () => {
      localStorage.setItem(
        `ghostboard.v1.pendingFlush.${testViewId}`,
        'invalid-json{'
      );

      const backup = readPendingFlushBackup(testViewId);
      expect(backup).toBeNull();
      expect(
        localStorage.getItem(`ghostboard.v1.pendingFlush.${testViewId}`)
      ).toBeNull();
    });

    it('clears and returns null for malformed payload (missing nodes)', () => {
      localStorage.setItem(
        `ghostboard.v1.pendingFlush.${testViewId}`,
        JSON.stringify({ edges: [], savedAt: Date.now() })
      );

      const backup = readPendingFlushBackup(testViewId);
      expect(backup).toBeNull();
      expect(
        localStorage.getItem(`ghostboard.v1.pendingFlush.${testViewId}`)
      ).toBeNull();
    });

    it('clears and returns null for malformed payload (missing edges)', () => {
      localStorage.setItem(
        `ghostboard.v1.pendingFlush.${testViewId}`,
        JSON.stringify({ nodes: [], savedAt: Date.now() })
      );

      const backup = readPendingFlushBackup(testViewId);
      expect(backup).toBeNull();
      expect(
        localStorage.getItem(`ghostboard.v1.pendingFlush.${testViewId}`)
      ).toBeNull();
    });

    it('clears and returns null for malformed payload (non-array nodes)', () => {
      localStorage.setItem(
        `ghostboard.v1.pendingFlush.${testViewId}`,
        JSON.stringify({ nodes: {}, edges: [], savedAt: Date.now() })
      );

      const backup = readPendingFlushBackup(testViewId);
      expect(backup).toBeNull();
      expect(
        localStorage.getItem(`ghostboard.v1.pendingFlush.${testViewId}`)
      ).toBeNull();
    });

    it('clears and returns null for malformed payload (non-array edges)', () => {
      localStorage.setItem(
        `ghostboard.v1.pendingFlush.${testViewId}`,
        JSON.stringify({ nodes: [], edges: {}, savedAt: Date.now() })
      );

      const backup = readPendingFlushBackup(testViewId);
      expect(backup).toBeNull();
      expect(
        localStorage.getItem(`ghostboard.v1.pendingFlush.${testViewId}`)
      ).toBeNull();
    });
  });

  describe('clearPendingFlushBackup', () => {
    it('removes a previously written backup', () => {
      const nodes: Node[] = [
        { id: '1', type: 'sticky', position: { x: 0, y: 0 }, data: {} },
      ];
      const edges: Edge[] = [];

      writePendingFlushBackup(testViewId, { nodes, edges, viewport: null });
      expect(
        localStorage.getItem(`ghostboard.v1.pendingFlush.${testViewId}`)
      ).toBeTruthy();

      clearPendingFlushBackup(testViewId);
      expect(
        localStorage.getItem(`ghostboard.v1.pendingFlush.${testViewId}`)
      ).toBeNull();
    });

    it('handles localStorage errors gracefully', () => {
      const originalLocalStorage = globalThis.localStorage;
      const mockLocalStorage = {
        getItem: (key: string) => originalLocalStorage.getItem(key),
        setItem: (key: string, value: string) =>
          originalLocalStorage.setItem(key, value),
        removeItem: vi.fn(() => {
          throw new Error('Storage error');
        }),
        clear: () => originalLocalStorage.clear(),
      };
      vi.stubGlobal('localStorage', mockLocalStorage);

      expect(() => clearPendingFlushBackup(testViewId)).not.toThrow();

      vi.unstubAllGlobals();
      vi.stubGlobal('localStorage', originalLocalStorage);
    });
  });

  it('keeps distinct recovery copies with the same timestamp and can manage them', () => {
    const backup = {
      nodes: [{ id: 'a', type: 'card', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      savedAt: 42,
    };
    archivePendingFlushBackup('view.with.dots', backup);
    archivePendingFlushBackup('view.with.dots', {
      ...backup,
      nodes: [{ ...backup.nodes[0]!, data: { title: 'Different' } }],
    });
    const entries = listRecoveryArchives();
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.viewId === 'view.with.dots')).toBe(
      true
    );
    expect(deleteRecoveryArchive(entries[0]!)).toBe(true);
    expect(listRecoveryArchives()).toHaveLength(1);
  });

  it('preserves damaged recovery evidence for export and refuses stale deletion', () => {
    const key = 'ghostboard.v1.pendingFlush.archive.view.42';
    localStorage.setItem(key, '{broken');
    const entry = listRecoveryArchives()[0]!;
    expect(entry.raw).toBe('{broken');
    expect(entry.backup).toBeNull();
    localStorage.setItem(key, 'new evidence');
    expect(deleteRecoveryArchive(entry)).toBe(false);
    expect(localStorage.getItem(key)).toBe('new evidence');
  });

  describe('round-trip', () => {
    it('preserves data through write-read-clear cycle', () => {
      const nodes: Node[] = [
        {
          id: '1',
          type: 'sticky',
          position: { x: 0, y: 0 },
          data: { content: 'hello' },
        },
        {
          id: '2',
          type: 'image',
          position: { x: 100, y: 100 },
          data: { url: 'test.jpg' },
        },
      ];
      const edges: Edge[] = [
        { id: 'e1', source: '1', target: '2', label: 'connected' },
      ];
      const viewport = { x: 50, y: 75, zoom: 2.0 };

      writePendingFlushBackup(testViewId, { nodes, edges, viewport });
      const backup = readPendingFlushBackup(testViewId);

      expect(backup).not.toBeNull();
      expect(backup!.nodes).toEqual(nodes);
      expect(backup!.edges).toEqual(edges);
      expect(backup!.viewport).toEqual(viewport);
      expect(backup!.savedAt).toBeLessThanOrEqual(Date.now());
      expect(backup!.savedAt).toBeGreaterThan(Date.now() - 1000);

      clearPendingFlushBackup(testViewId);
      expect(readPendingFlushBackup(testViewId)).toBeNull();
    });
  });
});
