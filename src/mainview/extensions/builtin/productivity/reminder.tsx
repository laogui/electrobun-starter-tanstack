import { Bell } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { ReminderWidgetBody } from '@/components/canvas/nodes/ReminderWidget';
import { REMINDER_CANVAS_TYPE_ID } from '../../../../shared/extensions/builtinIds';
import {
  buildReminderPresentation,
  createReminderInitialState,
  isReminderState,
  markReminderMissed,
  normalizeReminderState,
  type ReminderState,
  reminderFireAt,
  reminderWantsTask,
} from '../../../../shared/extensions/productivity/state';
import type { GhostBoardHostAPI } from '../../../../shared/extensions/protocol';

import type {
  BuiltinCanvasType,
  PreviewProps,
  SurfaceProps,
} from '../../types';

/**
 * One instance owns at most one live task, so a fixed id lets a reschedule
 * replace the previous entry instead of orphaning it.
 */
const REMINDER_TASK_ID = 'reminder';

function syncTask(
  host: GhostBoardHostAPI,
  state: ReminderState
): Promise<void> {
  if (!reminderWantsTask(state)) {
    return host.scheduler.cancel(REMINDER_TASK_ID).catch(() => undefined);
  }
  return host.scheduler
    .schedule({
      id: REMINDER_TASK_ID,
      fireAt: reminderFireAt(state),
      repeat: state.repeat ?? 'none',
    })
    .catch(() => undefined);
}

function ReminderCanvasSurface({
  context,
  host,
  state,
}: SurfaceProps<ReminderState>) {
  const normalized = normalizeReminderState(state);
  const latest = useRef(normalized);
  latest.current = normalized;

  // Registers the task for instances that predate host-driven scheduling. The
  // host owns firing from here, including anything already overdue.
  useEffect(() => {
    if (context.readOnly) {
      return;
    }
    syncTask(host, latest.current);
  }, [context.readOnly, host]);

  const commit = (next: ReminderState) => {
    host.instance
      .updateState({ history: 'record', state: next })
      .catch(() => undefined);
    if (
      reminderFireAt(next) !== reminderFireAt(normalized) ||
      next.status !== normalized.status ||
      next.repeat !== normalized.repeat
    ) {
      syncTask(host, next);
    }
  };

  return (
    <ReminderWidgetBody
      data={normalized}
      onChange={(updater) => {
        commit({ ...normalized, ...updater(normalized) });
      }}
      onTitleChange={(nextTitle) => {
        commit({ ...normalized, title: nextTitle });
      }}
      readOnly={context.readOnly}
      title={normalized.title}
    />
  );
}

function ReminderPreviewSurface({ state }: PreviewProps<ReminderState>) {
  const normalized = normalizeReminderState(state);
  return (
    <ReminderWidgetBody data={normalized} readOnly title={normalized.title} />
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
    defaultSize: { width: 320, height: 380 },
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
  onTaskFired: async (event, { host, state }) => {
    const normalized = normalizeReminderState(state);
    // A repeating reminder stays scheduled — the host already advanced it to
    // the next cycle, so only a one-shot becomes missed.
    if ((event.task.repeat ?? 'none') === 'none') {
      await host.instance
        .updateState({
          history: 'record',
          state: markReminderMissed(normalized),
        })
        .catch(() => undefined);
    }
    await host.notifications.show({
      title: normalized.title || 'Reminder',
      body: normalized.note,
    });
  },
};
