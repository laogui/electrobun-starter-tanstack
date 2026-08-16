export type AppLocale = 'en' | 'zh';

export function localeTag(locale: AppLocale): string {
  return locale === 'zh' ? 'zh-CN' : 'en-US';
}

export function parseDate(
  value: Date | string | null | undefined
): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (!value) {
    return;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatIsoDay(date: Date): string {
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTimeInput(date: Date): string {
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const TIME_INPUT_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

export function parseTimeInput(
  value: string
): { hours: number; minutes: number } | undefined {
  const match = TIME_INPUT_RE.exec(value.trim());
  if (!match) {
    return;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !(Number.isInteger(hours) && Number.isInteger(minutes)) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return;
  }
  return { hours, minutes };
}

/** Keep the current clock when the user picks a different calendar day. */
export function applyCalendarDay(
  current: Date | undefined,
  nextDay: Date
): Date {
  const next = new Date(nextDay);
  if (current && !Number.isNaN(current.getTime())) {
    next.setHours(
      current.getHours(),
      current.getMinutes(),
      current.getSeconds(),
      0
    );
    return next;
  }
  next.setHours(9, 0, 0, 0);
  return next;
}

export function applyTimeOfDay(
  current: Date | undefined,
  timeValue: string
): Date | undefined {
  const parsed = parseTimeInput(timeValue);
  if (!parsed) {
    return current;
  }
  const next =
    current && !Number.isNaN(current.getTime())
      ? new Date(current)
      : new Date();
  next.setHours(parsed.hours, parsed.minutes, 0, 0);
  return next;
}

export function calendarMonthBounds(now = new Date()): {
  endMonth: Date;
  startMonth: Date;
} {
  return {
    startMonth: new Date(now.getFullYear() - 5, 0),
    endMonth: new Date(now.getFullYear() + 10, 11),
  };
}

export function formatClock(
  value: Date | string,
  locale: AppLocale = 'en'
): string {
  const date = parseDate(value);
  if (!date) {
    return typeof value === 'string' ? value : '';
  }
  return new Intl.DateTimeFormat(localeTag(locale), {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatDay(
  value: Date | string,
  locale: AppLocale = 'en'
): string {
  const date = parseDate(value);
  if (!date) {
    return typeof value === 'string' ? value : '';
  }
  return new Intl.DateTimeFormat(localeTag(locale), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
