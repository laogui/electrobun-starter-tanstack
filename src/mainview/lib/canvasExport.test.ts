// @vitest-environment jsdom

import type { Node, ReactFlowInstance } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TRANSFORM_RE = /^translate\(.+\) scale\(.+\)$/;
const RHF_VIEWPORT_RE = /React Flow viewport/i;

const rpcMocks = vi.hoisted(() => ({
  rpcExportPng: vi.fn(),
}));

const htmlToImageMocks = vi.hoisted(() => ({
  toBlob: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  rpcExportPng: rpcMocks.rpcExportPng,
}));

vi.mock('html-to-image', () => ({
  toBlob: htmlToImageMocks.toBlob,
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
    htmlToImageMocks.toBlob.mockReset();
    rpcMocks.rpcExportPng.mockReset();
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

  it('opens the browser save picker and writes the PNG blob from html-to-image', async () => {
    const viewportEl = document.createElement('div');
    viewportEl.className = 'react-flow__viewport';
    document.body.appendChild(viewportEl);

    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePickerMock = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({
        close: closeMock,
        write: writeMock,
      }),
    });

    vi.stubGlobal('showSaveFilePicker', showSaveFilePickerMock);

    const expectedBlob = new Blob(['png'], { type: 'image/png' });
    htmlToImageMocks.toBlob.mockResolvedValue(expectedBlob);

    const exported = await exportReactFlowCanvasToPng({
      backgroundColor: '#fff',
      fileName: 'My Canvas',
      instance: createInstance([createNode('node-1')]),
      pixelRatio: 1,
    });

    expect(exported).toBe(true);
    expect(htmlToImageMocks.toBlob).toHaveBeenCalledTimes(1);
    const [target, options] = htmlToImageMocks.toBlob.mock.calls[0]!;
    expect(target).toBe(viewportEl);
    expect(options).toMatchObject({
      backgroundColor: '#fff',
      width: 368,
      height: 288,
      pixelRatio: 1,
    });
    expect(options.style.width).toBe('368px');
    expect(options.style.height).toBe('288px');
    expect(options.style.transform).toMatch(TRANSFORM_RE);

    expect(showSaveFilePickerMock).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'My Canvas.png' })
    );
    expect(writeMock).toHaveBeenCalledWith(expectedBlob);
    expect(closeMock).toHaveBeenCalled();
    expect(rpcMocks.rpcExportPng).not.toHaveBeenCalled();
  });

  it('throws when the React Flow viewport element is missing', async () => {
    htmlToImageMocks.toBlob.mockResolvedValue(
      new Blob(['png'], { type: 'image/png' })
    );

    await expect(
      exportReactFlowCanvasToPng({
        backgroundColor: '#fff',
        fileName: 'no-viewport',
        instance: createInstance([createNode('node-1')]),
        pixelRatio: 1,
      })
    ).rejects.toThrow(RHF_VIEWPORT_RE);
  });

  it('filters out controls, minimap, attribution and panels from the snapshot', async () => {
    const viewportEl = document.createElement('div');
    viewportEl.className = 'react-flow__viewport';
    document.body.appendChild(viewportEl);

    htmlToImageMocks.toBlob.mockResolvedValue(
      new Blob(['png'], { type: 'image/png' })
    );

    await exportReactFlowCanvasToPng({
      backgroundColor: '#fff',
      fileName: 'filter-test',
      instance: createInstance([createNode('node-1')]),
      pixelRatio: 1,
    });

    const filter = htmlToImageMocks.toBlob.mock.calls[0]?.[1]?.filter as (
      node: HTMLElement
    ) => boolean;
    expect(typeof filter).toBe('function');

    const make = (className: string) => {
      const el = document.createElement('div');
      el.className = className;
      return el;
    };

    expect(filter(make('react-flow__node react-flow__node-card'))).toBe(true);
    expect(filter(make('react-flow__edge'))).toBe(true);
    expect(filter(make('react-flow__minimap'))).toBe(false);
    expect(filter(make('react-flow__controls'))).toBe(false);
    expect(filter(make('react-flow__attribution'))).toBe(false);
    expect(filter(make('react-flow__panel some-extra'))).toBe(false);
  });
});
