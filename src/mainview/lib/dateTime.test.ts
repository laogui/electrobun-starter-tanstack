import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addDays,
  applyCalendarDay,
  applyTimeOfDay,
  calendarMonthBounds,
  formatClock,
  formatDay,
  formatIsoDay,
  formatTimeInput,
  localeTag,
  parseDate,
  parseTimeInput,
} from './dateTime';

const EN_CLOCK_RE = /1:45|13:45/;
const ZH_DAY_RE = /7月|7/;

describe('dateTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 12, 15, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses valid dates and rejects invalid ones', () => {
    const date = new Date(2026, 6, 8, 13, 45);
    expect(parseDate(date)).toEqual(date);
    expect(parseDate(date.toISOString())?.getTime()).toBe(date.getTime());
    expect(parseDate('not-a-date')).toBeUndefined();
    expect(parseDate('')).toBeUndefined();
    expect(parseDate(new Date(Number.NaN))).toBeUndefined();
  });

  it('formats ISO days and time inputs from local date parts', () => {
    const date = new Date(2026, 6, 8, 9, 5);
    expect(formatIsoDay(date)).toBe('2026-07-08');
    expect(formatTimeInput(date)).toBe('09:05');
  });

  it('parses time inputs and ignores invalid values', () => {
    expect(parseTimeInput('13:45')).toEqual({ hours: 13, minutes: 45 });
    expect(parseTimeInput('9:05')).toEqual({ hours: 9, minutes: 5 });
    expect(parseTimeInput('13:45:30')).toEqual({ hours: 13, minutes: 45 });
    expect(parseTimeInput('24:00')).toBeUndefined();
    expect(parseTimeInput('12:60')).toBeUndefined();
    expect(parseTimeInput('noon')).toBeUndefined();
  });

  it('keeps the current clock when applying a calendar day', () => {
    const current = new Date(2026, 6, 8, 20, 15, 30);
    const next = applyCalendarDay(current, new Date(2026, 6, 9, 0, 0, 0));
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(6);
    expect(next.getDate()).toBe(9);
    expect(next.getHours()).toBe(20);
    expect(next.getMinutes()).toBe(15);
    expect(next.getSeconds()).toBe(30);
  });

  it('defaults to 09:00 when applying a day without a current time', () => {
    const next = applyCalendarDay(undefined, new Date(2026, 6, 10));
    expect(formatIsoDay(next)).toBe('2026-07-10');
    expect(formatTimeInput(next)).toBe('09:00');
  });

  it('applies a time of day onto the current date', () => {
    const current = new Date(2026, 6, 8, 20, 15);
    const next = applyTimeOfDay(current, '13:45');
    expect(next).toEqual(new Date(2026, 6, 8, 13, 45, 0, 0));
    expect(applyTimeOfDay(current, 'nope')).toEqual(current);
  });

  it('adds days and exposes month bounds around the current year', () => {
    expect(formatIsoDay(addDays(new Date(2026, 6, 8), 1))).toBe('2026-07-09');
    expect(calendarMonthBounds()).toEqual({
      startMonth: new Date(2021, 0),
      endMonth: new Date(2036, 11),
    });
  });

  it('formats clock and day labels for en and zh', () => {
    const date = new Date(2026, 6, 8, 13, 45);
    expect(localeTag('zh')).toBe('zh-CN');
    expect(formatClock(date, 'en')).toMatch(EN_CLOCK_RE);
    expect(formatDay(date, 'en')).toContain('Jul');
    expect(formatDay(date, 'zh')).toMatch(ZH_DAY_RE);
  });
});
