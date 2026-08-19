import { Bell } from 'lucide-react';
import { useEffect } from 'react';

import { ReminderWidgetBody } from '@/components/canvas/nodes/ReminderWidget';
import { REMINDER_CANVAS_TYPE_ID } from '../../../../shared/extensions/builtinIds';
import {
  buildReminderPresentation,
  createReminderInitialState,
  isDueReminder,
  isReminderState,
  markReminderMissed,
  normalizeReminderState,
  type ReminderState,
} from '../../../../shared/extensions/productivity/state';

import type {
  BuiltinCanvasType,
  PreviewProps,
  SurfaceProps,
} from '../../types';

function ReminderCanvasSurface({
  context,
  host,
  state,
}: SurfaceProps<ReminderState>) {
  const normalized = normalizeReminderState(state);

  useEffect(() => {
    if (context.readOnly || !isDueReminder(normalized)) {
      return;
    }
    host.instance
      .updateState({
        history: 'record',
        state: markReminderMissed(normalized),
      })
      .catch(() => undefined);
    host.notifications
      .show({
        title: normalized.title || 'Reminder',
        body: normalized.note,
      })
      .catch(() => undefined);
  }, [context.readOnly, host, normalized]);

  useEffect(() => {
    if (context.readOnly || normalized.status === 'done') {
      return;
    }
    const fireAt =
      normalized.status === 'snoozed' && normalized.snoozedUntil
        ? normalized.snoozedUntil
        : normalized.dueAt;
    host.scheduler
      .schedule({
        id: `reminder:${fireAt}`,
        fireAt,
        repeat: normalized.repeat ?? 'none',
      })
      .catch(() => undefined);
  }, [context.readOnly, host, normalized]);

  return (
    <ReminderWidgetBody
      data={normalized}
      onChange={(updater) => {
        const next = updater(normalized);
        host.instance
          .updateState({
            history: 'record',
            state: { ...normalized, ...next },
          })
          .catch(() => undefined);
      }}
      onTitleChange={(nextTitle) => {
        host.instance
          .updateState({
            history: 'record',
            state: { ...normalized, title: nextTitle },
          })
          .catch(() => undefined);
      }}
      readOnly={context.readOnly}
      title={normalized.title}
    />
  );
}

function ReminderPreviewSurface({
  presentation,
  state,
}: PreviewProps<ReminderState>) {
  const normalized = normalizeReminderState(state);
  return (
    <div className="flex h-full flex-col justify-center gap-1 p-3">
      <div className="truncate font-medium text-sm">
        {presentation.title || normalized.title || 'Reminder'}
      </div>
      <div className="text-neutral-500 text-xs">{normalized.status}</div>
    </div>
  );
}

export const reminderCanvasType: BuiltinCanvasType<ReminderState> = {
  id: REMINDER_CANVAS_TYPE_ID,
  titleKey: 'canvas_type_productivity_reminder',
  descriptionKey: 'canvas_type_productivity_reminder_description',
  icon: Bell,
  category: 'productivity',
  dataVersion: 1,
  createFlow: 'immediate',
  capabilities: ['scheduler', 'notifications'],
  surface: {
    defaultSize: { width: 320, height: 340 },
    minSize: { width: 220, height: 220 },
    maxSize: { width: 800, height: 900 },
    resizable: true,
    openBehavior: 'none',
    canEnterGroup: true,
    canEnterFolder: false,
  },
  createInitialState: createReminderInitialState,
  validateState: isReminderState,
  migrateState: (record) => normalizeReminderState(record.state),
  buildPresentation: buildReminderPresentation,
  CanvasSurface: ReminderCanvasSurface,
  PreviewSurface: ReminderPreviewSurface,
};
