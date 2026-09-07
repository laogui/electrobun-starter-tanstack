// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasContextMenu } from '@/components/canvas/ContextMenu';
import { registerBuiltinCanvasTypes } from '@/extensions/registerBuiltins';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { POMODORO_CANVAS_TYPE_ID } from '../../../shared/extensions/builtinIds';
import { EXTENSION_INSTANCE_SCHEMA } from '../../../shared/extensions/instance';
import {
  buildPomodoroPresentation,
  createPomodoroInitialState,
} from '../../../shared/extensions/productivity/state';

registerBuiltinCanvasTypes();

const COPY_RE = /Copy/;
const DELETE_RE = /Delete/;
const OPEN_FOCUSED_RE = /Open focused/;

describe('CanvasContextMenu store subscriptions', () => {
  beforeEach(() => {
    const state = createPomodoroInitialState();
    useCanvasStore.getState().reset();
    useCanvasStore.setState({
      nodes: [
        {
          id: 'ext-pomodoro-1',
          type: 'extension',
          position: { x: 0, y: 0 },
          data: {
            canvasTypeId: POMODORO_CANVAS_TYPE_ID,
            instanceId: 'extinst_pomodoro_1',
          },
        },
      ],
    });
    useExtensionInstanceStore.getState().hydrate({
      extinst_pomodoro_1: {
        schema: EXTENSION_INSTANCE_SCHEMA,
        id: 'extinst_pomodoro_1',
        canvasTypeId: POMODORO_CANVAS_TYPE_ID,
        appVersion: '1.0.0',
        dataVersion: 1,
        revision: 1,
        createdAt: '2026-09-07T00:00:00.000Z',
        updatedAt: '2026-09-07T00:00:00.000Z',
        state,
        presentation: buildPomodoroPresentation(state),
      },
    });
  });

  afterEach(() => {
    useCanvasStore.getState().reset();
    useExtensionInstanceStore.setState({ history: {}, records: {} });
  });

  it('renders a Productivity extension menu against the real Zustand stores', () => {
    render(
      <CanvasContextMenu
        menu={{
          x: 40,
          y: 60,
          target: 'extension',
          nodeId: 'ext-pomodoro-1',
        }}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: COPY_RE })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DELETE_RE })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: OPEN_FOCUSED_RE })).toBeNull();
  });
});
