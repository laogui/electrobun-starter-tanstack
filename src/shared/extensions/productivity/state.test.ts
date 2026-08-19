import { describe, expect, it } from 'vitest';

import {
  buildChecklistPresentation,
  completeExpiredPomodoro,
  createPomodoroInitialState,
  isExpiredRunningPomodoro,
  normalizeChecklistState,
} from './state';

describe('productivity presentation and timers', () => {
  it('projects checklist items into plain text', () => {
    const presentation = buildChecklistPresentation({
      title: 'Bugs',
      items: [
        { id: '1', text: 'Crash', checked: false },
        { id: '2', text: 'Typo', checked: true },
      ],
    });
    expect(presentation.title).toBe('Bugs');
    expect(presentation.plainText).toContain('[ ] Crash');
    expect(presentation.plainText).toContain('[x] Typo');
    expect(presentation.subtitle).toBe('1 open');
  });

  it('completes an expired running pomodoro once', () => {
    const running = {
      ...createPomodoroInitialState(),
      timer: {
        state: 'running' as const,
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        durationMs: 1000,
      },
    };
    expect(isExpiredRunningPomodoro(running)).toBe(true);
    const done = completeExpiredPomodoro(running);
    expect(done.timer).toEqual({ state: 'idle' });
    expect(done.completedSessions).toBe(1);
    expect(isExpiredRunningPomodoro(done)).toBe(false);
  });

  it('fills a missing checklist title', () => {
    expect(normalizeChecklistState({ items: [] }).title).toBe('Checklist');
  });
});
