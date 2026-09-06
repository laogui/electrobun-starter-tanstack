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

vi.mock('@/lib/rpc', () => ({
  rpcCloneExtensionInstance: vi.fn(),
  rpcCreateExtensionInstance: vi.fn(),
  rpcUpdateExtensionInstance: vi.fn(),
}));

vi.mock('../../../paraglide/messages.js', () => ({
  menu_ai_summarize: () => 'Summarize with AI',
}));

import { SelectionAIToolbar } from '@/components/canvas/SelectionAIToolbar';
import { useAIPanelStore } from '@/store/aiPanelStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { EXTENSION_INSTANCE_SCHEMA } from '../../../shared/extensions/instance';

describe('SelectionAIToolbar', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    useExtensionInstanceStore.setState({ records: {}, history: {} });
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

  it('shows the toolbar for a selected extension with presentation', () => {
    useExtensionInstanceStore.getState().hydrate({
      extinst_link1: {
        schema: EXTENSION_INSTANCE_SCHEMA,
        id: 'extinst_link1',
        canvasTypeId: 'ghostboard.web/link',
        appVersion: '1.0.0',
        dataVersion: 1,
        revision: 1,
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:01:00.000Z',
        state: {
          url: 'https://example.com',
          title: 'Example',
          color: '#FFFFFF',
        },
        presentation: {
          title: 'Example',
          plainText: 'Example\nhttps://example.com',
        },
      },
    });
    useCanvasStore.setState({
      nodes: [
        {
          id: 'ext-link-1',
          type: 'extension',
          position: { x: 0, y: 0 },
          selected: true,
          style: { width: 100, height: 80 },
          data: {
            canvasTypeId: 'ghostboard.web/link',
            instanceId: 'extinst_link1',
          },
        },
      ] as never,
    });

    render(<SelectionAIToolbar />);
    expect(
      screen.getByRole('button', { name: 'Summarize with AI' })
    ).toBeInTheDocument();
  });
});
