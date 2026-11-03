// @vitest-environment jsdom
import type { ReactFlowInstance } from '@xyflow/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flush: vi.fn(),
  json: vi.fn(),
  png: vi.fn(),
  markdown: vi.fn(),
}));
vi.mock('@/lib/canvasFlushRegistry', () => ({
  flushRegisteredCanvas: mocks.flush,
}));
vi.mock('@/lib/canvasExport', () => ({
  exportReactFlowCanvasToJson: mocks.json,
  exportReactFlowCanvasToPng: mocks.png,
  sanitizeExportFileName: (name: string) => name,
}));
vi.mock('@/lib/rpc', () => ({
  isRpcAvailable: async () => true,
  rpcExportNotesMarkdown: mocks.markdown,
}));
const { useCanvasStore } = await import('@/store/canvasStore');
const { useCanvasExport } = await import('./useCanvasExport');
let root: Root;
let actions: ReturnType<typeof useCanvasExport>;
function Harness() {
  actions = useCanvasExport({
    activeViewId: 'original',
    activeViewName: 'Original canvas',
    canvasBackground: '#fff',
    // Export is mocked; this fixture only supplies the viewport read by the hook.
    rfInstance: {
      current: {
        getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      } as ReactFlowInstance,
    },
  });
  return null;
}
beforeEach(async () => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.flush.mockResolvedValue(true);
  mocks.json.mockResolvedValue(true);
  mocks.png.mockResolvedValue(true);
  useCanvasStore.getState().reset();
  useCanvasStore.getState().setActiveView('original');
  useCanvasStore.getState().hydrate([], []);
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it.each([
  'json',
  'png',
] as const)('refuses a %s export when saving crosses a canvas session, including leaving and returning', async (format) => {
  mocks.flush.mockImplementationOnce(async () => {
    useCanvasStore.getState().setActiveView('other');
    useCanvasStore.getState().setActiveView('original');
    useCanvasStore.getState().hydrate([], []);
    return true;
  });
  await act(async () => {
    await (format === 'json'
      ? actions.onExportCanvasJson()
      : actions.onExportCanvas());
  });
  expect(mocks[format]).not.toHaveBeenCalled();
});

it('exports the latest flushed graph under its matching canvas identity', async () => {
  mocks.flush.mockImplementationOnce(async () => {
    useCanvasStore.setState({
      nodes: [
        { id: 'latest', type: 'card', position: { x: 0, y: 0 }, data: {} },
      ],
    });
    return true;
  });
  await act(async () => actions.onExportCanvasJson());
  expect(mocks.json).toHaveBeenCalledWith(
    expect.objectContaining({
      viewId: 'original',
      viewName: 'Original canvas',
      nodes: [expect.objectContaining({ id: 'latest' })],
    })
  );
});
