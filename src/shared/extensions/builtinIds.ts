/**
 * Stable built-in canvas type ids. Meanings must not change after publish.
 * Checklist, Pomodoro, Reminder and Recording are retired: their ids remain
 * only so the canvas loader can recognise and migrate old data.
 */

export const CHECKLIST_CANVAS_TYPE_ID =
  'ghostboard.productivity/checklist' as const;
export const POMODORO_CANVAS_TYPE_ID =
  'ghostboard.productivity/pomodoro' as const;
export const REMINDER_CANVAS_TYPE_ID =
  'ghostboard.productivity/reminder' as const;
export const LINK_CANVAS_TYPE_ID = 'ghostboard.web/link' as const;
export const IMAGE_CANVAS_TYPE_ID = 'ghostboard.media/image' as const;
export const FILE_CANVAS_TYPE_ID = 'ghostboard.media/file' as const;
export const RECORDING_CANVAS_TYPE_ID = 'ghostboard.media/recording' as const;

export type BuiltinCanvasTypeId =
  | typeof CHECKLIST_CANVAS_TYPE_ID
  | typeof POMODORO_CANVAS_TYPE_ID
  | typeof REMINDER_CANVAS_TYPE_ID
  | typeof LINK_CANVAS_TYPE_ID
  | typeof IMAGE_CANVAS_TYPE_ID
  | typeof FILE_CANVAS_TYPE_ID
  | typeof RECORDING_CANVAS_TYPE_ID;

export type BuiltinSearchKind = 'asset' | 'extension' | 'image' | 'link';

const SEARCH_KIND_BY_CANVAS_TYPE_ID: Partial<
  Record<BuiltinCanvasTypeId, Exclude<BuiltinSearchKind, 'extension'>>
> = {
  [LINK_CANVAS_TYPE_ID]: 'link',
  [IMAGE_CANVAS_TYPE_ID]: 'image',
  [FILE_CANVAS_TYPE_ID]: 'asset',
};

/** Host display adapter for search results; not part of the extension protocol. */
export function searchKindForCanvasType(
  canvasTypeId: string
): BuiltinSearchKind {
  return (
    SEARCH_KIND_BY_CANVAS_TYPE_ID[canvasTypeId as BuiltinCanvasTypeId] ??
    'extension'
  );
}

/** Canvas type a retired legacy widget kind was migrated to. */
export function canvasTypeIdForWidgetKind(
  kind: string
):
  | typeof CHECKLIST_CANVAS_TYPE_ID
  | typeof POMODORO_CANVAS_TYPE_ID
  | typeof REMINDER_CANVAS_TYPE_ID
  | undefined {
  switch (kind) {
    case 'checklist':
      return CHECKLIST_CANVAS_TYPE_ID;
    case 'pomodoro':
      return POMODORO_CANVAS_TYPE_ID;
    case 'reminder':
      return REMINDER_CANVAS_TYPE_ID;
    default:
      return;
  }
}

export function canvasTypeIdForLegacyNodeType(
  nodeType: string
): BuiltinCanvasTypeId | undefined {
  switch (nodeType) {
    case 'link':
      return LINK_CANVAS_TYPE_ID;
    case 'image':
      return IMAGE_CANVAS_TYPE_ID;
    case 'asset':
      return FILE_CANVAS_TYPE_ID;
    default:
      return;
  }
}
