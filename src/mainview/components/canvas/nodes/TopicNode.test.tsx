// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setTopicEditPreviewMock = vi.fn();
const resetTopicEditPreviewMock = vi.fn();
const setTopicDraftTextMock = vi.fn();

const topicNode: Node = {
  data: { color: 'neutral', title: 'Hello', topicVersion: 1 },
  id: 'topic-1',
  position: { x: 0, y: 0 },
  style: { height: 38, width: 120 },
  type: 'topic',
};

const storeState = {
  beginTopicRelativeDraft: vi.fn(),
  cancelTopicDraft: vi.fn(),
  commitTopicDraft: vi.fn(() => Promise.resolve('node-new')),
  commitTopicTitle: vi.fn(),
  edges: [],
  editingTopicId: null as string | null,
  enterTopicCommandContext: vi.fn(),
  exitTopicCommandContext: vi.fn(),
  nodes: [topicNode],
  resetTopicEditPreview: resetTopicEditPreviewMock,
  setEditingTopicId: vi.fn(),
  setTopicDraftText: setTopicDraftTextMock,
  setTopicEditPreview: setTopicEditPreviewMock,
};

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: Object.assign(
    (selector: (state: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState }
  ),
}));

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
  Position: {
    Top: 'top',
    Right: 'right',
    Bottom: 'bottom',
    Left: 'left',
  },
}));

import TopicNode from './TopicNode';

const openEditor = () => {
  render(<TopicNode data={{ ...topicNode.data }} id="topic-1" />);
  // Single click opens the Topic editor (the canvas' click-to-open rule).
  fireEvent.click(screen.getByRole('button'));
  return screen.getByRole('textbox') as HTMLTextAreaElement;
};

describe('TopicNode title editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.editingTopicId = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('previews the size of an existing Topic on every keystroke', () => {
    const editor = openEditor();
    fireEvent.change(editor, { target: { value: 'Hello world' } });
    expect(setTopicEditPreviewMock).toHaveBeenCalledWith(
      'topic-1',
      'Hello world'
    );
    expect(setTopicDraftTextMock).not.toHaveBeenCalled();
  });

  it('restores the stored size when the edit is cancelled', () => {
    const editor = openEditor();
    fireEvent.change(editor, { target: { value: 'Hello world' } });
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(resetTopicEditPreviewMock).toHaveBeenCalledWith('topic-1');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('commits on blur and drops the preview through the same reset', () => {
    const editor = openEditor();
    fireEvent.change(editor, { target: { value: 'Retitled' } });
    fireEvent.blur(editor);
    expect(storeState.commitTopicTitle).toHaveBeenCalledWith(
      'topic-1',
      'Retitled'
    );
    expect(resetTopicEditPreviewMock).toHaveBeenCalledWith('topic-1');
  });

  it('remeasures after a width change and disconnects on unmount', () => {
    let notifyResize = () => {};
    const disconnect = vi.fn();
    const OriginalObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this);
      }
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    };
    try {
      const editor = openEditor();
      let width = 80;
      Object.defineProperty(editor, 'clientWidth', { get: () => width });
      Object.defineProperty(editor, 'scrollHeight', {
        get: () => (width === 80 ? 80 : 20),
      });
      fireEvent.change(editor, { target: { value: 'Pasted text' } });
      expect(editor.style.height).toBe('80px');
      width = 240;
      notifyResize();
      expect(editor.style.height).toBe('20px');
      fireEvent.keyDown(editor, { key: 'Escape' });
      expect(disconnect).toHaveBeenCalled();
    } finally {
      globalThis.ResizeObserver = OriginalObserver;
    }
  });

  it('discards the preview when the node unmounts', () => {
    const { unmount } = render(
      <TopicNode data={{ ...topicNode.data }} id="topic-1" />
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Uncommitted' },
    });
    unmount();
    expect(resetTopicEditPreviewMock).toHaveBeenCalledWith('topic-1');
  });

  it('routes a draft node keystrokes to the draft text instead', () => {
    render(
      <TopicNode
        data={{ ...topicNode.data, isDraft: true }}
        id="topic-draft-1"
      />
    );
    const editor = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'Draft text' } });
    expect(setTopicDraftTextMock).toHaveBeenCalledWith('Draft text');
    expect(setTopicEditPreviewMock).not.toHaveBeenCalled();
  });
});
