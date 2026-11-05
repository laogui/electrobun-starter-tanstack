/**
 * Shape of a retired Checklist card's state. Only read by the canvas loader,
 * which turns an old checklist into a note with a GFM task list.
 */

export interface ChecklistItem {
  checked: boolean;
  id: string;
  isHeader?: boolean;
  text: string;
}

export interface ChecklistState {
  items: ChecklistItem[];
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeChecklistState(value: unknown): ChecklistState {
  if (!(isRecord(value) && Array.isArray(value.items))) {
    return { title: 'Checklist', items: [] };
  }
  return {
    title: typeof value.title === 'string' ? value.title : 'Checklist',
    items: value.items.map((item) => {
      const record: Record<string, unknown> = isRecord(item) ? item : {};
      return {
        id: typeof record.id === 'string' ? record.id : 'item_unknown',
        text: typeof record.text === 'string' ? record.text : '',
        checked: Boolean(record.checked),
        ...(record.isHeader ? { isHeader: true } : {}),
      };
    }),
  };
}
