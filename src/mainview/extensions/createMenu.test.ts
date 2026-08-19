import { Hash } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { COUNTER_CANVAS_TYPE_ID } from '../../shared/extensions/demo/counter';
import { canvasTypeMenuActionId } from '../../shared/extensions/ids';

import { counterCanvasType } from './builtin/counter';
import { getCanvasTypeMenuItems } from './createMenu';

describe('getCanvasTypeMenuItems', () => {
  it('builds create-menu items from registered types', () => {
    const items = getCanvasTypeMenuItems([counterCanvasType], (key) =>
      key === 'canvas_type_demo_counter' ? 'Counter' : key
    );
    expect(items).toEqual([
      {
        enabled: true,
        icon: Hash,
        id: canvasTypeMenuActionId(COUNTER_CANVAS_TYPE_ID),
        label: 'Counter',
      },
    ]);
  });
});
