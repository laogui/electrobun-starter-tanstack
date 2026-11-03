import { ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { ChecklistFocusedView } from '@/components/canvas/ChecklistFocusedView';
import type {
  CardContentData,
  ChecklistItem as EditorChecklistItem,
} from '@/components/canvas/nodes/CardNode';
import { ChecklistWidgetBody } from '@/components/canvas/nodes/WidgetNode';
import * as m from '../../../../paraglide/messages.js';
import { CHECKLIST_CANVAS_TYPE_ID } from '../../../../shared/extensions/builtinIds';
import {
  buildChecklistPresentation,
  type ChecklistState,
  createChecklistInitialState,
  isChecklistState,
  normalizeChecklistState,
} from '../../../../shared/extensions/productivity/state';

import type {
  BuiltinCanvasType,
  PreviewProps,
  SurfaceProps,
} from '../../types';

function normalizeEditorItems(
  items: EditorChecklistItem[]
): ChecklistState['items'] {
  return items.map((item) => {
    const source = item as EditorChecklistItem &
      Partial<ChecklistState['items'][number]>;
    return {
      id:
        typeof source.id === 'string' && source.id
          ? source.id
          : `item_${crypto.randomUUID().slice(0, 8)}`,
      text: typeof source.text === 'string' ? source.text : '',
      checked: Boolean(source.checked),
      ...(source.isHeader ? { isHeader: true } : {}),
      ...(typeof source.createdAt === 'string'
        ? { createdAt: source.createdAt }
        : {}),
      ...(typeof source.completedAt === 'string'
        ? { completedAt: source.completedAt }
        : {}),
    };
  });
}

function ChecklistCanvasSurface({
  context,
  host,
  state,
}: SurfaceProps<ChecklistState>) {
  const normalized = normalizeChecklistState(state);
  return (
    <ChecklistWidgetBody
      data={{ items: normalized.items }}
      nodeId="checklist"
      onChange={(updater) => {
        const next = updater({ items: normalized.items });
        host.instance
          .updateState({
            history: 'record',
            state: { ...normalized, items: next.items },
          })
          .catch(() => undefined);
      }}
      readOnly={context.readOnly}
      title={normalized.title}
    />
  );
}

function ChecklistPreviewSurface({ state }: PreviewProps<ChecklistState>) {
  const normalized = normalizeChecklistState(state);
  return (
    <ChecklistWidgetBody
      data={{ items: normalized.items }}
      nodeId="checklist-preview"
      readOnly
      title={normalized.title}
    />
  );
}

function ChecklistDetailSurface({ host, state }: SurfaceProps<ChecklistState>) {
  const normalized = normalizeChecklistState(state);
  const data: CardContentData = {
    type: 'checklist',
    title: normalized.title,
    items: normalized.items,
  };

  return (
    <ChecklistFocusedView
      data={data}
      onCommit={(updates) => {
        const nextState: ChecklistState = {
          ...normalized,
          ...(typeof updates.title === 'string'
            ? { title: updates.title }
            : {}),
          ...(updates.items
            ? { items: normalizeEditorItems(updates.items) }
            : {}),
        };
        host.instance
          .updateState({ history: 'record', state: nextState })
          .catch(() => {
            toast.error(m.toast_save_failed());
          });
      }}
    />
  );
}

export const checklistCanvasType: BuiltinCanvasType<ChecklistState> = {
  id: CHECKLIST_CANVAS_TYPE_ID,
  titleKey: 'canvas_type_productivity_checklist',
  descriptionKey: 'canvas_type_productivity_checklist_description',
  icon: ListChecks,
  category: 'productivity',
  dataVersion: 1,
  createFlow: 'immediate',
  interactions: { supportsTags: true },
  surface: {
    defaultSize: { width: 320, height: 380 },
    minSize: { width: 220, height: 220 },
    maxSize: { width: 800, height: 900 },
    resizable: true,
    openBehavior: 'detail',
    canEnterGroup: true,
    canEnterFolder: false,
  },
  createInitialState: createChecklistInitialState,
  validateState: isChecklistState,
  migrateState: (record) => normalizeChecklistState(record.state),
  buildPresentation: buildChecklistPresentation,
  CanvasSurface: ChecklistCanvasSurface,
  PreviewSurface: ChecklistPreviewSurface,
  DetailSurface: ChecklistDetailSurface,
};
