// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const viewportMock = vi.hoisted(() => vi.fn());
const runAISummarizeMock = vi.hoisted(() => vi.fn());

vi.mock('@xyflow/react', () => ({
  useViewport: viewportMock,
}));

vi.mock('@/lib/ai/runAISummarize', () => ({
  runAISummarize: (...args: unknown[]) => runAISummarizeMock(...args),
}));

vi.mock('../../../paraglide/messages.js', () => ({
  menu_ai_summarize: () => 'Summarize with AI',
}));

import { SelectionAIToolbar } from '@/components/canvas/SelectionAIToolbar';
import { useAIPanelStore } from '@/store/aiPanelStore';
import { useCanvasStore } from '@/store/canvasStore';

describe('SelectionAIToolbar', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    useAIPanelStore.getState().close();
    viewportMock.mockReturnValue({ x: 0, y: 0, zoom: 1 });
    runAISummarizeMock.mockReset();
    runAISummarizeMock.mockResolvedValue(undefined);
  });

  it('hides the button when there is no summarizable selection', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'a',
          type: 'card',
          position: { x: 0, y: 0 },
          selected: true,
          style: { width: 100, height: 80 },
          data: {},
        },
      ] as never,
    });

    render(<SelectionAIToolbar />);
    expect(
      screen.queryByRole('button', { name: 'Summarize with AI' })
    ).toBeNull();
  });

  it('anchors a summarize button to the selection top-right', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'a',
          type: 'card',
          position: { x: 100, y: 50 },
          selected: true,
          style: { width: 200, height: 100 },
          data: { title: 'Hello', content: 'World' },
        },
      ] as never,
    });
    viewportMock.mockReturnValue({ x: 10, y: 20, zoom: 2 });

    render(<SelectionAIToolbar />);

    const button = screen.getByRole('button', { name: 'Summarize with AI' });
    expect(button).toBeInTheDocument();

    // right = 100+200 = 300 → screen 300*2+10 = 610
    // top = 50 → screen 50*2+20 = 120; gap 8 → top 112
    const shell = button.parentElement as HTMLElement;
    expect(shell.style.left).toBe('610px');
    expect(shell.style.top).toBe('112px');
  });

  it('hides while a focused view is open', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'a',
          type: 'card',
          position: { x: 0, y: 0 },
          selected: true,
          style: { width: 100, height: 80 },
          data: { title: 'Hello', content: 'World' },
        },
      ] as never,
      focusedNode: {
        id: 'a',
        type: 'card',
        data: { title: 'Hello' },
      } as never,
    });

    render(<SelectionAIToolbar />);
    expect(
      screen.queryByRole('button', { name: 'Summarize with AI' })
    ).toBeNull();
  });

  it('disables the button while an AI task is loading', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'a',
          type: 'card',
          position: { x: 0, y: 0 },
          selected: true,
          style: { width: 100, height: 80 },
          data: { title: 'Hello', content: 'World' },
        },
      ] as never,
    });
    useAIPanelStore.getState().openLoading('summarize_selection', 1, 'view-a');

    render(<SelectionAIToolbar />);

    const button = screen.getByRole('button', { name: 'Summarize with AI' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('invokes runAISummarize when clicked', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'a',
          type: 'sticky',
          position: { x: 0, y: 0 },
          selected: true,
          style: { width: 100, height: 80 },
          data: { content: 'Note body' },
        },
      ] as never,
    });

    render(<SelectionAIToolbar />);

    fireEvent.click(screen.getByRole('button', { name: 'Summarize with AI' }));
    expect(runAISummarizeMock).toHaveBeenCalledTimes(1);
  });
});
