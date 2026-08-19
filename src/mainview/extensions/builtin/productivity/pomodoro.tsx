import { Timer } from 'lucide-react';
import { useCallback } from 'react';

import { PomodoroWidgetBody } from '@/components/canvas/nodes/PomodoroWidget';
import { POMODORO_CANVAS_TYPE_ID } from '../../../../shared/extensions/builtinIds';
import {
  buildPomodoroPresentation,
  completeExpiredPomodoro,
  createPomodoroInitialState,
  isExpiredRunningPomodoro,
  isPomodoroState,
  normalizePomodoroState,
  type PomodoroState,
} from '../../../../shared/extensions/productivity/state';

import type {
  BuiltinCanvasType,
  PreviewProps,
  SurfaceProps,
} from '../../types';

function PomodoroCanvasSurface({
  context,
  host,
  state,
}: SurfaceProps<PomodoroState>) {
  const normalized = normalizePomodoroState(state);
  const completeIfDue = useCallback(() => {
    if (!isExpiredRunningPomodoro(normalized)) {
      return;
    }
    host.instance
      .updateState({
        history: 'record',
        state: completeExpiredPomodoro(normalized),
      })
      .catch(() => undefined);
  }, [host, normalized]);

  return (
    <PomodoroWidgetBody
      data={normalized}
      onChange={(updater) => {
        const next = updater(normalized);
        const history =
          next.timer.state === 'running' && normalized.timer.state === 'running'
            ? 'ephemeral'
            : 'record';
        host.instance
          .updateState({
            history,
            state: { ...normalized, ...next },
          })
          .catch(() => undefined);
      }}
      onCompleteIfDue={completeIfDue}
      readOnly={context.readOnly}
      widgetId="pomodoro"
    />
  );
}

function PomodoroPreviewSurface({ state }: PreviewProps<PomodoroState>) {
  return (
    <PomodoroWidgetBody
      data={normalizePomodoroState(state)}
      readOnly
      widgetId="pomodoro-preview"
    />
  );
}

export const pomodoroCanvasType: BuiltinCanvasType<PomodoroState> = {
  id: POMODORO_CANVAS_TYPE_ID,
  titleKey: 'canvas_type_productivity_pomodoro',
  descriptionKey: 'canvas_type_productivity_pomodoro_description',
  icon: Timer,
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
  createInitialState: createPomodoroInitialState,
  validateState: isPomodoroState,
  migrateState: (record) => normalizePomodoroState(record.state),
  buildPresentation: buildPomodoroPresentation,
  CanvasSurface: PomodoroCanvasSurface,
  PreviewSurface: PomodoroPreviewSurface,
};
