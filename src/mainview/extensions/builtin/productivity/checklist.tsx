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

export const checklistCanvasType: BuiltinCanvasType<ChecklistState> = {
  id: CHECKLIST_CANVAS_TYPE_ID,
  titleKey: 'canvas_type_productivity_checklist',
  descriptionKey: 'canvas_type_productivity_checklist_description',
  icon: ListChecks,
  category: 'productivity',
  dataVersion: 1,
  createFlow: 'immediate',
  surface: {
    defaultSize: { width: 320, height: 380 },
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
