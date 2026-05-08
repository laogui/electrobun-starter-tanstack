// @vitest-environment jsdom

import type { Node, ReactFlowInstance } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TRANSFORM_RE = /^translate\(.+\) scale\(.+\)$/;
const RHF_VIEWPORT_RE = /React Flow viewport/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T/;
const NO_VISIBLE_NODES_RE = /no visible nodes/i;

const rpcMocks = vi.hoisted(() => ({
  rpcExportJson: vi.fn(),
  rpcExportPng: vi.fn(),
}));

const htmlToImageMocks = vi.hoisted(() => ({
  toBlob: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  rpcExportJson: rpcMocks.rpcExportJson,
  rpcExportPng: rpcMocks.rpcExportPng,
}));

vi.mock('html-to-image', () => ({
  toBlob: htmlToImageMocks.toBlob,
}));

import {
  buildCanvasExportJson,
  CANVAS_EXPORT_SCHEMA,
  exportReactFlowCanvasToJson,
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
    rpcMocks.rpcExportJson.mockReset();
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

  it('builds a self-contained JSON document and skips detached / hidden nodes plus dangling edges', () => {
    const visible = createNode('visible', {
      title: 'Hello',
      content: '## Body',
    });
    const detached = createNode('detached', { detached: true });
    const hidden = createNode('hidden', { isHidden: true });

    const doc = buildCanvasExportJson({
      nodes: [visible, detached, hidden],
      edges: [
        { id: 'e-keep', source: 'visible', target: 'visible' },
        { id: 'e-drop', source: 'visible', target: 'hidden' },
      ] as any,
      viewId: 'view_1',
      viewName: 'Roadmap',
      viewport: { x: 1, y: 2, zoom: 1.5 },
    });

    expect(doc.schema).toBe(CANVAS_EXPORT_SCHEMA);
    expect(doc.viewId).toBe('view_1');
    expect(doc.viewName).toBe('Roadmap');
    expect(doc.viewport).toEqual({ x: 1, y: 2, zoom: 1.5 });
    expect(doc.exportedAt).toMatch(ISO_DATE_RE);
    expect(doc.nodes.map((n) => (n as { id: string }).id)).toEqual(['visible']);
    expect(doc.nodes[0]).toMatchObject({
      id: 'visible',
      data: { title: 'Hello', content: '## Body' },
    });
    expect(doc.edges.map((e) => (e as { id: string }).id)).toEqual(['e-keep']);
  });

  it('opens the browser save picker and writes the JSON document', async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePickerMock = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({
        close: closeMock,
        write: writeMock,
      }),
    });
    vi.stubGlobal('showSaveFilePicker', showSaveFilePickerMock);

    const exported = await exportReactFlowCanvasToJson({
      edges: [],
      fileName: 'My Canvas',
      nodes: [createNode('node-1', { title: 'Card' })],
      viewId: 'view_1',
      viewName: 'My Canvas',
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(exported).toBe(true);
    expect(showSaveFilePickerMock).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'My Canvas.json' })
    );
    expect(writeMock).toHaveBeenCalledTimes(1);
    const writtenBlob = writeMock.mock.calls[0]![0] as Blob;
    expect(writtenBlob).toBeInstanceOf(Blob);
    expect(writtenBlob.type).toContain('application/json');
    expect(writtenBlob.size).toBeGreaterThan(0);
    expect(closeMock).toHaveBeenCalled();
    expect(rpcMocks.rpcExportJson).not.toHaveBeenCalled();
  });

  it('falls back to the native save dialog when showSaveFilePicker is unavailable', async () => {
    rpcMocks.rpcExportJson.mockResolvedValue({
      filePath: '/tmp/canvas.json',
      success: true,
    });

    const exported = await exportReactFlowCanvasToJson({
      edges: [],
      fileName: 'Roadmap',
      nodes: [createNode('node-1', { title: 'Card' })],
    });

    expect(exported).toBe(true);
    expect(rpcMocks.rpcExportJson).toHaveBeenCalledTimes(1);
    const [json, fileName] = rpcMocks.rpcExportJson.mock.calls[0]!;
    expect(fileName).toBe('Roadmap');
    const parsed = JSON.parse(json as string) as { schema: string };
    expect(parsed.schema).toBe(CANVAS_EXPORT_SCHEMA);
  });

  it('throws when the canvas has no exportable nodes', async () => {
    await expect(
      exportReactFlowCanvasToJson({
        edges: [],
        fileName: 'empty',
        nodes: [createNode('detached', { detached: true })],
      })
    ).rejects.toThrow(NO_VISIBLE_NODES_RE);
  });
});
