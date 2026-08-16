import type {
  PomodoroClockKind,
  PomodoroTimerState,
  PomodoroWidgetData,
  StopwatchTimerState,
} from '@/lib/widgetTypes';

export const STOPWATCH_RING_MS = 60_000;

const NEXT_POMODORO_MODE = {
  focus: 'shortBreak',
  shortBreak: 'longBreak',
  longBreak: 'focus',
} as const satisfies Record<
  PomodoroWidgetData['mode'],
  PomodoroWidgetData['mode']
>;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clockKindOf(data: PomodoroWidgetData): PomodoroClockKind {
  return data.clockKind === 'stopwatch' ? 'stopwatch' : 'pomodoro';
}

export function stopwatchOf(data: PomodoroWidgetData): StopwatchTimerState {
  return data.stopwatch ?? { state: 'idle' };
}

export function durationForPomodoroMode(data: PomodoroWidgetData): number {
  switch (data.mode) {
    case 'focus':
      return data.focusMinutes * 60 * 1000;
    case 'shortBreak':
      return data.shortBreakMinutes * 60 * 1000;
    case 'longBreak':
      return data.longBreakMinutes * 60 * 1000;
    default: {
      const _exhaustive: never = data.mode;
      return _exhaustive;
    }
  }
}

export function remainingPomodoroMs(
  data: PomodoroWidgetData,
  nowMs = Date.now()
): number {
  if (data.timer.state === 'paused') {
    return Math.max(0, data.timer.remainingMs);
  }
  if (data.timer.state === 'running') {
    const startedAt = Date.parse(data.timer.startedAt);
    if (!Number.isFinite(startedAt)) {
      return durationForPomodoroMode(data);
    }
    return Math.max(0, startedAt + data.timer.durationMs - nowMs);
  }
  return durationForPomodoroMode(data);
}

export function elapsedStopwatchMs(
  stopwatch: StopwatchTimerState | undefined,
  nowMs = Date.now()
): number {
  if (!stopwatch || stopwatch.state === 'idle') {
    return 0;
  }
  if (stopwatch.state === 'paused') {
    return Math.max(0, stopwatch.elapsedMs);
  }
  const startedAt = Date.parse(stopwatch.startedAt);
  const base = Math.max(0, stopwatch.elapsedMs);
  if (!Number.isFinite(startedAt)) {
    return base;
  }
  return Math.max(0, base + (nowMs - startedAt));
}

/** MM:SS, or H:MM:SS once the clock crosses an hour. */
export function formatClock(
  ms: number,
  rounding: 'ceil' | 'floor' = 'floor'
): string {
  const totalSeconds = Math.max(
    0,
    rounding === 'ceil' ? Math.ceil(ms / 1000) : Math.floor(ms / 1000)
  );
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function pomodoroProgress(
  data: PomodoroWidgetData,
  nowMs = Date.now()
): number {
  const totalMs = durationForPomodoroMode(data);
  if (totalMs <= 0) {
    return 0;
  }
  return clamp(1 - remainingPomodoroMs(data, nowMs) / totalMs, 0, 1);
}

export function stopwatchProgress(
  stopwatch: StopwatchTimerState | undefined,
  nowMs = Date.now()
): number {
  return (
    (elapsedStopwatchMs(stopwatch, nowMs) % STOPWATCH_RING_MS) /
    STOPWATCH_RING_MS
  );
}

export function applyClockKind(
  data: PomodoroWidgetData,
  clockKind: PomodoroClockKind
): PomodoroWidgetData {
  if (clockKindOf(data) === clockKind) {
    return data;
  }
  return { ...data, clockKind };
}

export function applyPomodoroMode(
  data: PomodoroWidgetData,
  mode: PomodoroWidgetData['mode']
): PomodoroWidgetData {
  if (data.mode === mode) {
    return data;
  }
  return {
    ...data,
    mode,
    timer: { state: 'idle' },
  };
}

export function cyclePomodoroMode(
  data: PomodoroWidgetData
): PomodoroWidgetData {
  return applyPomodoroMode(data, NEXT_POMODORO_MODE[data.mode]);
}

export function applyPomodoroStart(
  data: PomodoroWidgetData,
  now = new Date()
): PomodoroWidgetData {
  if (data.timer.state === 'running') {
    return data;
  }
  const durationMs =
    data.timer.state === 'paused'
      ? data.timer.remainingMs
      : durationForPomodoroMode(data);
  return {
    ...data,
    timer: {
      state: 'running',
      startedAt: now.toISOString(),
      durationMs,
    },
  };
}

export function applyPomodoroPause(
  data: PomodoroWidgetData,
  nowMs = Date.now()
): PomodoroWidgetData {
  if (data.timer.state !== 'running') {
    return data;
  }
  return {
    ...data,
    timer: {
      state: 'paused',
      remainingMs: remainingPomodoroMs(data, nowMs),
    },
  };
}

export function applyPomodoroReset(
  data: PomodoroWidgetData
): PomodoroWidgetData {
  if (data.timer.state === 'idle') {
    return data;
  }
  return { ...data, timer: { state: 'idle' } };
}

export function applyPomodoroStop(
  data: PomodoroWidgetData
): PomodoroWidgetData {
  if (data.timer.state === 'idle') {
    return data;
  }
  return { ...data, timer: { state: 'idle' } };
}

export function applyStopwatchStart(
  data: PomodoroWidgetData,
  now = new Date()
): PomodoroWidgetData {
  const stopwatch = stopwatchOf(data);
  if (stopwatch.state === 'running') {
    return data;
  }
  const elapsedMs = stopwatch.state === 'paused' ? stopwatch.elapsedMs : 0;
  return {
    ...data,
    stopwatch: {
      state: 'running',
      startedAt: now.toISOString(),
      elapsedMs,
    },
  };
}

export function applyStopwatchPause(
  data: PomodoroWidgetData,
  nowMs = Date.now()
): PomodoroWidgetData {
  const stopwatch = stopwatchOf(data);
  if (stopwatch.state !== 'running') {
    return data;
  }
  return {
    ...data,
    stopwatch: {
      state: 'paused',
      elapsedMs: elapsedStopwatchMs(stopwatch, nowMs),
    },
  };
}

export function applyStopwatchReset(
  data: PomodoroWidgetData,
  now = new Date()
): PomodoroWidgetData {
  const stopwatch = stopwatchOf(data);
  if (stopwatch.state === 'running') {
    return {
      ...data,
      stopwatch: {
        state: 'running',
        startedAt: now.toISOString(),
        elapsedMs: 0,
      },
    };
  }
  if (stopwatch.state === 'idle') {
    return data;
  }
  return { ...data, stopwatch: { state: 'idle' } };
}

export function applyStopwatchStop(
  data: PomodoroWidgetData
): PomodoroWidgetData {
  if (stopwatchOf(data).state === 'idle') {
    return data;
  }
  return { ...data, stopwatch: { state: 'idle' } };
}

export function visibleTimerState(
  data: PomodoroWidgetData
): PomodoroTimerState['state'] {
  if (clockKindOf(data) === 'stopwatch') {
    return stopwatchOf(data).state;
  }
  return data.timer.state;
}
