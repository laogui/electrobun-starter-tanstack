import { ListChecks } from 'lucide-react';

import { ChecklistWidgetBody } from '@/components/canvas/nodes/WidgetNode';
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

function ChecklistPreviewSurface({
  presentation,
  state,
}: PreviewProps<ChecklistState>) {
  const normalized = normalizeChecklistState(state);
  const open = normalized.items.filter(
    (item) => !(item.checked || item.isHeader)
  ).length;
  return (
    <div className="flex h-full flex-col justify-center gap-1 p-3">
      <div className="truncate font-medium text-sm">
        {presentation.title || normalized.title || 'Checklist'}
      </div>
      <div className="text-neutral-500 text-xs">{open} open</div>
    </div>
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
  surface: {
    defaultSize: { width: 320, height: 340 },
    minSize: { width: 220, height: 220 },
    maxSize: { width: 800, height: 900 },
    resizable: true,
    openBehavior: 'none',
    canEnterGroup: true,
    canEnterFolder: false,
  },
  createInitialState: createChecklistInitialState,
  validateState: isChecklistState,
  migrateState: (record) => normalizeChecklistState(record.state),
  buildPresentation: buildChecklistPresentation,
  CanvasSurface: ChecklistCanvasSurface,
  PreviewSurface: ChecklistPreviewSurface,
};
