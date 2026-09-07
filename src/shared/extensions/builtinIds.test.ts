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
  searchKindForCanvasType,
  widgetKindForCanvasType,
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

  it('maps published ids to host search display kinds', () => {
    expect(searchKindForCanvasType(CHECKLIST_CANVAS_TYPE_ID)).toBe('widget');
    expect(searchKindForCanvasType(POMODORO_CANVAS_TYPE_ID)).toBe('widget');
    expect(searchKindForCanvasType(REMINDER_CANVAS_TYPE_ID)).toBe('widget');
    expect(searchKindForCanvasType(LINK_CANVAS_TYPE_ID)).toBe('link');
    expect(searchKindForCanvasType(IMAGE_CANVAS_TYPE_ID)).toBe('image');
    expect(searchKindForCanvasType(FILE_CANVAS_TYPE_ID)).toBe('asset');
    expect(searchKindForCanvasType(RECORDING_CANVAS_TYPE_ID)).toBe('recording');
    expect(searchKindForCanvasType('example.third-party/custom')).toBe(
      'extension'
    );
  });

  it('maps productivity ids back to legacy widget display kinds', () => {
    expect(widgetKindForCanvasType(CHECKLIST_CANVAS_TYPE_ID)).toBe('checklist');
    expect(widgetKindForCanvasType(POMODORO_CANVAS_TYPE_ID)).toBe('pomodoro');
    expect(widgetKindForCanvasType(REMINDER_CANVAS_TYPE_ID)).toBe('reminder');
    expect(widgetKindForCanvasType(LINK_CANVAS_TYPE_ID)).toBeUndefined();
    expect(
      widgetKindForCanvasType('example.third-party/custom')
    ).toBeUndefined();
  });
});
