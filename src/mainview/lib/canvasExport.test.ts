// @vitest-environment jsdom

import type { Node, ReactFlowInstance } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rpcMocks = vi.hoisted(() => ({
  rpcExportPng: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  rpcExportPng: rpcMocks.rpcExportPng,
}));

import {
  exportReactFlowCanvasToPng,
  getVisibleExportNodes,
  prepareCanvasExport,
  sanitizeExportFileName,
} from '@/lib/canvasExport';

const createNode = (id: string, data: Record<string, unknown> = {}): Node => ({
  id,
  data,
  position: { x: 0, y: 0 },
  type: 'card',
});

const createInstance = (nodes: Node[], bounds = { x: 10, y: 20 }) =>
  ({
    getEdges: () => [],
    getNodes: () => nodes,
    getNodesBounds: vi.fn(() => ({
      ...bounds,
      height: 160,
      width: 240,
    })),
  }) as unknown as ReactFlowInstance<any, any>;

describe('canvas export helpers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('filters out detached and temporarily hidden nodes', () => {
    const visibleNode = createNode('visible');
    const instance = createInstance([
      visibleNode,
      createNode('detached', { detached: true }),
      createNode('hidden', { isHidden: true }),
    ]);

    expect(getVisibleExportNodes(instance)).toEqual([visibleNode]);
  });

  it('sanitizes canvas names for PNG downloads', () => {
    expect(sanitizeExportFileName('  My Canvas / Draft #1  ')).toBe(
      'My-Canvas-Draft-1'
    );
    expect(sanitizeExportFileName('***')).toBe('ghostboard-canvas');
  });

  it('prepares export dimensions with canvas padding', () => {
    const node = createNode('node-1');
    const instance = createInstance([node]);
    const prepared = prepareCanvasExport(instance, [node]);

    expect(prepared?.dimensions).toEqual({ height: 288, width: 368 });
    expect(prepared?.nodeBounds).toMatchObject({ height: 160, width: 240 });
    expect(instance.getNodesBounds).toHaveBeenCalledWith([node]);
  });

  it('returns null when no visible nodes can be exported', () => {
    expect(prepareCanvasExport(createInstance([]), [])).toBeNull();
  });

  it('opens the browser save picker and writes the PNG blob', async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePickerMock = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({
        close: closeMock,
        write: writeMock,
      }),
    });

    vi.stubGlobal('showSaveFilePicker', showSaveFilePickerMock);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      arcTo: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      lineTo: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
      moveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      scale: vi.fn(),
      setLineDash: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => {
        callback(new Blob(['png'], { type: 'image/png' }));
      }
    );
    const exported = await exportReactFlowCanvasToPng({
      backgroundColor: '#fff',
      fileName: 'My Canvas',
      instance: createInstance([createNode('node-1')]),
      pixelRatio: 1,
    });

    expect(exported).toBe(true);
    expect(showSaveFilePickerMock).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'My Canvas.png' })
    );
    expect(writeMock).toHaveBeenCalledWith(expect.any(Blob));
    expect(closeMock).toHaveBeenCalled();
    expect(rpcMocks.rpcExportPng).not.toHaveBeenCalled();
  });
});
