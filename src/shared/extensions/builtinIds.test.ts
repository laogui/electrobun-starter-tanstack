import { describe, expect, it } from 'vitest';

import {
  CHECKLIST_CANVAS_TYPE_ID,
  canvasTypeIdForLegacyNodeType,
  canvasTypeIdForWidgetKind,
  FILE_CANVAS_TYPE_ID,
  IMAGE_CANVAS_TYPE_ID,
  LINK_CANVAS_TYPE_ID,
  POMODORO_CANVAS_TYPE_ID,
  RECORDING_CANVAS_TYPE_ID,
  REMINDER_CANVAS_TYPE_ID,
} from './builtinIds';
import { isCanvasTypeId } from './ids';

describe('builtin canvas type ids', () => {
  it('maps legacy kinds to published ids', () => {
    expect(canvasTypeIdForWidgetKind('checklist')).toBe(
      CHECKLIST_CANVAS_TYPE_ID
    );
    expect(canvasTypeIdForWidgetKind('pomodoro')).toBe(POMODORO_CANVAS_TYPE_ID);
    expect(canvasTypeIdForWidgetKind('reminder')).toBe(REMINDER_CANVAS_TYPE_ID);
    expect(canvasTypeIdForWidgetKind('other')).toBeUndefined();
    expect(canvasTypeIdForLegacyNodeType('link')).toBe(LINK_CANVAS_TYPE_ID);
    expect(canvasTypeIdForLegacyNodeType('image')).toBe(IMAGE_CANVAS_TYPE_ID);
    expect(canvasTypeIdForLegacyNodeType('asset')).toBe(FILE_CANVAS_TYPE_ID);
    expect(canvasTypeIdForLegacyNodeType('recording')).toBe(
      RECORDING_CANVAS_TYPE_ID
    );
  });

  it('uses the published ghostboard.<pack>/<type> shape', () => {
    expect(isCanvasTypeId(CHECKLIST_CANVAS_TYPE_ID)).toBe(true);
    expect(isCanvasTypeId(LINK_CANVAS_TYPE_ID)).toBe(true);
    expect(isCanvasTypeId(IMAGE_CANVAS_TYPE_ID)).toBe(true);
  });
});
