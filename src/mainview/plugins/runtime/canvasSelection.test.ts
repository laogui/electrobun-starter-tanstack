import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { canvasSelection } from './canvasSelection';

function node(
  id: string,
  data: Record<string, unknown> = {},
  extra: Partial<Node> = {}
): Node {
  return {
    id,
    data,
    selected: true,
    position: { x: 0, y: 0 },
    type: 'card',
    ...extra,
  };
}
describe('canvas selection identity boundary', () => {
  it('includes selected visible placements with explicit backing identities but does not expand containers', () => {
    const snapshot = canvasSelection({
      _hydrated: true,
      activeViewId: 'view',
      nodes: [
        node('a', { noteId: 'shared', title: 'Unsaved local title' }),
        node('b', { noteId: 'shared' }),
        node('c', { widgetId: 'widget' }),
        node('d', { instanceId: 'instance' }, { type: 'extension' }),
        node('e', { children: [{ noteId: 'inside' }] }, { type: 'folder' }),
        node('f', {}, { type: 'image' }),
        node('hidden', { noteId: 'hidden' }, { hidden: true }),
        node('detached', { noteId: 'detached', detached: true }),
        node('unselected', { noteId: 'unselected' }, { selected: false }),
      ],
    });
    expect(snapshot).toEqual({
      viewId: 'view',
      items: [
        { id: 'a', content: { kind: 'note', id: 'shared' } },
        { id: 'b', content: { kind: 'note', id: 'shared' } },
        { id: 'c', content: { kind: 'widget', id: 'widget' } },
        { id: 'd', content: { kind: 'extension', id: 'instance' } },
        { id: 'e', content: null },
        { id: 'f', content: null },
      ],
    });
  });
  it('never exposes stale nodes before hydration', () => {
    expect(
      canvasSelection({
        _hydrated: false,
        activeViewId: 'old',
        nodes: [node('old', { noteId: 'old' })],
      })
    ).toEqual({ viewId: null, items: [] });
  });
});
