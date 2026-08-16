import { describe, expect, it } from 'vitest';
import type { PomodoroWidgetData } from '@/lib/widgetTypes';
import {
  applyClockKind,
  applyPomodoroPause,
  applyPomodoroReset,
  applyPomodoroStart,
  applyPomodoroStop,
  applyStopwatchPause,
  applyStopwatchReset,
  applyStopwatchStart,
  applyStopwatchStop,
  clockKindOf,
  cyclePomodoroMode,
  durationForPomodoroMode,
  elapsedStopwatchMs,
  formatClock,
  pomodoroProgress,
  remainingPomodoroMs,
  stopwatchProgress,
} from './pomodoroTimer';

const NOW = '2026-07-08T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);

function base(overrides: Partial<PomodoroWidgetData> = {}): PomodoroWidgetData {
  return {
    mode: 'focus',
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
    completedSessions: 0,
    timer: { state: 'idle' },
    ...overrides,
  };
}

describe('pomodoroTimer', () => {
  it('treats missing clockKind as pomodoro and missing stopwatch as idle', () => {
    const data = base();
    expect(clockKindOf(data)).toBe('pomodoro');
    expect(elapsedStopwatchMs(data.stopwatch, NOW_MS)).toBe(0);
  });

  it('formats padded MM:SS and rolls into H:MM:SS', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(74_000)).toBe('01:14');
    expect(formatClock(25 * 60 * 1000)).toBe('25:00');
    expect(formatClock(3_661_000)).toBe('1:01:01');
    expect(formatClock(1, 'ceil')).toBe('00:01');
    expect(formatClock(1, 'floor')).toBe('00:00');
  });

  it('counts remaining pomodoro time from idle, running, and paused states', () => {
    expect(remainingPomodoroMs(base(), NOW_MS)).toBe(25 * 60 * 1000);
    expect(
      remainingPomodoroMs(
        base({
          timer: {
            state: 'running',
            startedAt: '2026-07-08T11:59:00.000Z',
            durationMs: 25 * 60 * 1000,
          },
        }),
        NOW_MS
      )
    ).toBe(24 * 60 * 1000);
    expect(
      remainingPomodoroMs(
        base({ timer: { state: 'paused', remainingMs: 90_000 } }),
        NOW_MS
      )
    ).toBe(90_000);
    expect(durationForPomodoroMode(base({ mode: 'shortBreak' }))).toBe(
      5 * 60 * 1000
    );
  });

  it('starts, pauses, resumes, resets, and stops the pomodoro clock', () => {
    const started = applyPomodoroStart(base(), new Date(NOW));
    expect(started.timer).toEqual({
      state: 'running',
      startedAt: NOW,
      durationMs: 25 * 60 * 1000,
    });

    const paused = applyPomodoroPause(started, NOW_MS + 10_000);
    expect(paused.timer).toEqual({
      state: 'paused',
      remainingMs: 25 * 60 * 1000 - 10_000,
    });

    const resumed = applyPomodoroStart(paused, new Date(NOW));
    expect(resumed.timer).toEqual({
      state: 'running',
      startedAt: NOW,
      durationMs: 25 * 60 * 1000 - 10_000,
    });

    expect(applyPomodoroReset(started).timer).toEqual({ state: 'idle' });
    expect(applyPomodoroStop(started).timer).toEqual({ state: 'idle' });
  });

  it('starts, pauses, resumes, resets, and stops the stopwatch independently', () => {
    const started = applyStopwatchStart(base(), new Date(NOW));
    expect(started.timer).toEqual({ state: 'idle' });
    expect(started.stopwatch).toEqual({
      state: 'running',
      startedAt: NOW,
      elapsedMs: 0,
    });
    expect(elapsedStopwatchMs(started.stopwatch, NOW_MS + 74_000)).toBe(74_000);

    const paused = applyStopwatchPause(started, NOW_MS + 74_000);
    expect(paused.stopwatch).toEqual({
      state: 'paused',
      elapsedMs: 74_000,
    });

    const resumed = applyStopwatchStart(paused, new Date(NOW));
    expect(resumed.stopwatch).toEqual({
      state: 'running',
      startedAt: NOW,
      elapsedMs: 74_000,
    });
    expect(elapsedStopwatchMs(resumed.stopwatch, NOW_MS + 1000)).toBe(75_000);

    const resetRunning = applyStopwatchReset(started, new Date(NOW));
    expect(resetRunning.stopwatch).toEqual({
      state: 'running',
      startedAt: NOW,
      elapsedMs: 0,
    });

    expect(applyStopwatchStop(started).stopwatch).toEqual({ state: 'idle' });
  });

  it('keeps the other clock running when switching tabs', () => {
    const running = applyPomodoroStart(base(), new Date(NOW));
    const switched = applyClockKind(running, 'stopwatch');
    expect(clockKindOf(switched)).toBe('stopwatch');
    expect(switched.timer).toEqual(running.timer);
    expect(applyClockKind(switched, 'stopwatch')).toBe(switched);
  });

  it('cycles focus / short / long and idles the pomodoro timer', () => {
    const running = applyPomodoroStart(base(), new Date(NOW));
    const next = cyclePomodoroMode(running);
    expect(next.mode).toBe('shortBreak');
    expect(next.timer).toEqual({ state: 'idle' });
    expect(cyclePomodoroMode(next).mode).toBe('longBreak');
    expect(cyclePomodoroMode(cyclePomodoroMode(next)).mode).toBe('focus');
  });

  it('maps ring progress for both clocks', () => {
    expect(pomodoroProgress(base(), NOW_MS)).toBe(0);
    expect(
      pomodoroProgress(
        base({
          timer: {
            state: 'running',
            startedAt: NOW,
            durationMs: 25 * 60 * 1000,
          },
        }),
        NOW_MS + 25 * 60 * 250
      )
    ).toBe(0.25);
    expect(
      stopwatchProgress(
        { state: 'running', startedAt: NOW, elapsedMs: 0 },
        NOW_MS + 15_000
      )
    ).toBe(0.25);
  });
});
