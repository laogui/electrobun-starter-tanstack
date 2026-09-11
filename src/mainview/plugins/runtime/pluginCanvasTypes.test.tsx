// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CanvasTypeDefinition } from '../../../../packages/plugin-sdk';
import type { ExtensionInstanceRecord } from '../../../shared/extensions/instance';
import type { GhostBoardHostAPI } from '../../../shared/extensions/protocol';
import { adaptPluginCanvasType, pluginCanvasTypeId } from './pluginCanvasTypes';

const INVALID_INITIAL_STATE_RE = /invalid JSON state/;
const INVALID_LOCAL_ID_RE = /plugin-local/;
const NEWER_VERSION_RE = /newer plugin version/;

interface CounterState {
  count: number;
  label: string;
}

function definition(
  overrides: Partial<CanvasTypeDefinition<CounterState>> = {}
): CanvasTypeDefinition<CounterState> {
  return {
    id: 'counter',
    title: 'Public counter',
    dataVersion: 2,
    createInitialState: () => ({ count: 0, label: 'Initial' }),
    validateState: (state): state is CounterState =>
      !!state &&
      !Array.isArray(state) &&
      typeof state === 'object' &&
      typeof (state as { count?: unknown }).count === 'number' &&
      typeof (state as { label?: unknown }).label === 'string',
    summarize: (state) => ({
      title: `<b>${state.label}</b>`,
      plainText: `Count ${state.count}`,
    }),
    component: ({ state, updateState }) => (
      <button
        onClick={() => {
          updateState({ ...state, count: state.count + 1 }).catch(
            () => undefined
          );
        }}
        type="button"
      >
        {state.count}
      </button>
    ),
    ...overrides,
  };
}

function record(overrides: Partial<ExtensionInstanceRecord> = {}) {
  return {
    schema: 'ghostboard-extension-instance/v1',
    id: 'extinst_public',
    canvasTypeId: 'example.cards/counter',
    appVersion: '1.0.0',
    dataVersion: 1,
    revision: 1,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    state: { count: 3 },
    presentation: { title: 'Old' },
    ...overrides,
  } satisfies ExtensionInstanceRecord;
}

describe('public plugin canvas type adapter', () => {
  it('derives a plugin-owned canonical id and sanitizes summaries', () => {
    const type = adaptPluginCanvasType('example.cards', definition());
    expect(type.id).toBe('example.cards/counter');
    expect(type.createInitialState()).toEqual({ count: 0, label: 'Initial' });
    expect(type.buildPresentation({ count: 7, label: '<i>Seven</i>' })).toEqual(
      {
        title: 'Seven',
        plainText: 'Count 7',
      }
    );
    expect(pluginCanvasTypeId('example.cards', 'counter')).toBe(type.id);
    expect(() => pluginCanvasTypeId('example.cards', 'Not Valid')).toThrow(
      INVALID_LOCAL_ID_RE
    );
  });

  it('adapts component updates to recorded host instance writes', async () => {
    const type = adaptPluginCanvasType('example.cards', definition());
    const updateState = vi.fn(async ({ state }) => ({
      revision: 2,
      state,
      presentation: { title: 'Updated' },
    })) as GhostBoardHostAPI['instance']['updateState'];
    const host = {
      instance: { getState: vi.fn(), updateState },
    } as unknown as GhostBoardHostAPI;
    render(
      <type.CanvasSurface
        context={{
          height: 200,
          locale: 'en',
          readOnly: false,
          selected: false,
          surface: 'canvas',
          theme: 'light',
          width: 280,
        }}
        host={host}
        presentation={{ title: 'Counter' }}
        state={{ count: 1, label: 'One' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    await vi.waitFor(() => {
      expect(updateState).toHaveBeenCalledWith({
        history: 'record',
        state: { count: 2, label: 'One' },
      });
    });
  });

  it('migrates old JSON state and rejects newer or invalid results', () => {
    const type = adaptPluginCanvasType(
      'example.cards',
      definition({
        migrateState: (state) => ({
          count:
            state && !Array.isArray(state) && typeof state === 'object'
              ? Number(state.count)
              : 0,
          label: 'Migrated',
        }),
      })
    );
    expect(type.migrateState(record())).toEqual({
      count: 3,
      label: 'Migrated',
    });
    expect(() => type.migrateState(record({ dataVersion: 3 }))).toThrow(
      NEWER_VERSION_RE
    );

    expect(() =>
      adaptPluginCanvasType(
        'example.cards',
        definition({
          createInitialState: () => new Date() as unknown as CounterState,
        })
      )
    ).toThrow(INVALID_INITIAL_STATE_RE);
  });
});
