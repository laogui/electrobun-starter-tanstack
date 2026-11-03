// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/lib/rpc', async (original) => ({
  ...(await original<typeof import('@/lib/rpc')>()),
  rpcSaveBlockNote: vi.fn(),
}));
const rpc = await import('@/lib/rpc');
const { useCanvasStore } = await import('@/store/canvasStore');
const { useBlockNoteSaver } = await import('./useBlockNoteSaver');
const { flushRegisteredCanvas } = await import('@/lib/canvasFlushRegistry');
const save = vi.mocked(rpc.rpcSaveBlockNote);
let root: Root;
let saver: ReturnType<typeof useBlockNoteSaver>;
function Harness() {
  saver = useBlockNoteSaver({
    nodeId: 'node',
    noteId: 'note',
    frontmatter: { title: 'Title' },
  });
  return null;
}
beforeEach(async () => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  useCanvasStore.getState().reset();
  useCanvasStore.getState().hydrate(
    [
      {
        id: 'node',
        type: 'card',
        position: { x: 0, y: 0 },
        data: {
          noteId: 'note',
          content: 'Legacy fallback',
          editor: 'blocknote',
        },
      },
    ],
    []
  );
  save.mockResolvedValue({
    success: true,
    revision: 2,
    preview: {
      blocks: 1,
      excerpt: 'Latest',
      html: '<p>Latest</p>',
      version: 1,
    },
  });
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
  act(() => saver.setInitialRevision(1));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});
it('flushes the latest JSON blocks on close without needing or erasing a Markdown mirror', async () => {
  const latest = [{ type: 'paragraph', content: 'Last keystroke' }];
  act(() => {
    saver.markDirty();
    saver.saveDebounced({ blocks: [] });
    saver.markDirty();
    saver.saveDebounced({ blocks: latest });
  });
  await act(async () => root.unmount());
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(
    'note',
    expect.any(Object),
    latest,
    undefined,
    1
  );
  expect(useCanvasStore.getState().nodes[0]?.data.content).toBe(
    'Legacy fallback'
  );
  expect(useCanvasStore.getState().nodes[0]?.data.previewHtml).toBe(
    '<p>Latest</p>'
  );
});
it('keeps JSON edits available for retry after a failed save', async () => {
  save.mockResolvedValueOnce({ success: false });
  const blocks = [{ type: 'paragraph', content: 'Retained draft' }];
  act(() => {
    saver.markDirty();
    saver.saveDebounced({ blocks });
  });
  await act(async () => saver.flushNow());
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => saver.flushNow());
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1]?.[2]).toEqual(blocks);
});

it('single-note Markdown export saves the latest JSON draft before requesting the host export', async () => {
  const previousClient = globalThis.__ghostboardInitPromise;
  const previousUnavailable = globalThis.__ghostboardNotElectrobun;
  const exportNoteMarkdown = vi.fn(async () => ({ success: true }));
  Reflect.set(globalThis, '__ghostboardNotElectrobun', false);
  Reflect.set(
    globalThis,
    '__ghostboardInitPromise',
    Promise.resolve({ rpc: { request: { exportNoteMarkdown } } })
  );
  try {
    act(() => {
      saver.markDirty();
      saver.saveDebounced({
        blocks: [{ type: 'paragraph', content: 'Newest' }],
      });
    });
    await act(async () => rpc.rpcExportNoteMarkdown('note'));
    expect(save).toHaveBeenCalledOnce();
    expect(exportNoteMarkdown).toHaveBeenCalledOnce();
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(
      exportNoteMarkdown.mock.invocationCallOrder[0]!
    );
  } finally {
    globalThis.__ghostboardInitPromise = previousClient;
    globalThis.__ghostboardNotElectrobun = previousUnavailable;
  }
});

it('Markdown export refuses a canvas change during the RPC wrapper flush', async () => {
  const previousClient = globalThis.__ghostboardInitPromise;
  const previousUnavailable = globalThis.__ghostboardNotElectrobun;
  const exportNotesMarkdown = vi.fn(async () => ({ success: true }));
  const { registerNoteFlusher } = await import('@/lib/canvasFlushRegistry');
  const unregister = registerNoteFlusher(async () => {
    useCanvasStore.getState().setActiveView('another');
    return true;
  });
  Reflect.set(globalThis, '__ghostboardNotElectrobun', false);
  Reflect.set(
    globalThis,
    '__ghostboardInitPromise',
    Promise.resolve({ rpc: { request: { exportNotesMarkdown } } })
  );
  try {
    await expect(
      rpc.rpcExportNotesMarkdown('selected', { noteIds: ['note'] })
    ).rejects.toThrow();
    expect(exportNotesMarkdown).not.toHaveBeenCalled();
  } finally {
    unregister();
    globalThis.__ghostboardInitPromise = previousClient;
    globalThis.__ghostboardNotElectrobun = previousUnavailable;
  }
});
it('quit and export flushes await the pending JSON note save and report failures', async () => {
  save.mockResolvedValueOnce({ success: false });
  act(() => {
    saver.markDirty();
    saver.saveDebounced({
      blocks: [{ type: 'paragraph', content: 'Unsaved' }],
    });
  });
  let first: boolean | undefined;
  await act(async () => {
    first = await flushRegisteredCanvas();
  });
  expect(first).toBe(false);
  let retried: boolean | undefined;
  await act(async () => {
    retried = await flushRegisteredCanvas();
  });
  expect(retried).toBe(true);
  expect(save).toHaveBeenCalledTimes(2);
});
it('a late note acknowledgement cannot update an identically named node in another canvas', async () => {
  let finish: (value: { success: boolean; revision: number }) => void = () =>
    undefined;
  save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  act(() => {
    saver.markDirty();
    saver.saveDebounced({
      blocks: [{ type: 'paragraph', content: 'Old view draft' }],
    });
    saver.flushNow();
  });
  act(() => {
    useCanvasStore.getState().setActiveView('other');
    useCanvasStore.getState().hydrate(
      [
        {
          id: 'node',
          type: 'card',
          position: { x: 0, y: 0 },
          data: { noteId: 'different', content: 'Other view' },
        },
      ],
      []
    );
  });
  await act(async () => finish({ success: true, revision: 99 }));
  expect(useCanvasStore.getState().nodes[0]?.data).toEqual({
    noteId: 'different',
    content: 'Other view',
  });
});
