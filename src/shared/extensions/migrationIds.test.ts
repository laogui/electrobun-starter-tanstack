import { describe, expect, it } from 'vitest';

import { isInstanceId } from './ids';
import {
  instanceIdFromInlineNode,
  instanceIdFromWidgetId,
  stableHex,
} from './migrationIds';

describe('migration ids', () => {
  it('derives a valid instance id from a widget id', () => {
    const id = instanceIdFromWidgetId('widget_abc123');
    expect(id).toBe('extinst_widget_abc123');
    expect(isInstanceId(id)).toBe(true);
  });

  it('is stable for the same inline node identity', () => {
    const a = instanceIdFromInlineNode({
      viewId: 'view_1',
      nodeId: 'n_1',
      type: 'link',
    });
    const b = instanceIdFromInlineNode({
      viewId: 'view_1',
      nodeId: 'n_1',
      type: 'link',
    });
    const c = instanceIdFromInlineNode({
      viewId: 'view_1',
      nodeId: 'n_1',
      type: 'image',
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(isInstanceId(a)).toBe(true);
  });

  it('changes when the folder child path changes', () => {
    const top = instanceIdFromInlineNode({
      viewId: 'view_1',
      nodeId: 'child_1',
      type: 'link',
    });
    const nested = instanceIdFromInlineNode({
      viewId: 'view_1',
      nodeId: 'child_1',
      type: 'link',
      childPath: 'folder_a/child_1',
    });
    expect(top).not.toBe(nested);
  });

  it('hashes the same input to the same hex', () => {
    expect(stableHex('abc')).toBe(stableHex('abc'));
    expect(stableHex('abc')).not.toBe(stableHex('abd'));
  });
});
