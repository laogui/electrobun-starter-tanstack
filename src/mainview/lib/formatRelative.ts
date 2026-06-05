const RELATIVE_TIME_UNITS: Array<{
  limit: number;
  divisor: number;
  unit: Intl.RelativeTimeFormatUnit;
}> = [
  { limit: 60_000, divisor: 1000, unit: 'second' },
  { limit: 3_600_000, divisor: 60_000, unit: 'minute' },
  { limit: 86_400_000, divisor: 3_600_000, unit: 'hour' },
  { limit: 604_800_000, divisor: 86_400_000, unit: 'day' },
  { limit: 2_592_000_000, divisor: 604_800_000, unit: 'week' },
  { limit: 31_536_000_000, divisor: 2_592_000_000, unit: 'month' },
];

export function formatRelativeTime(input: string | number): string {
  const timestamp =
    typeof input === 'string' ? new Date(input).getTime() : input;
  if (!timestamp || Number.isNaN(timestamp)) {
    return '';
  }
  const diff = timestamp - Date.now();
  const absDiff = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const { limit, divisor, unit } of RELATIVE_TIME_UNITS) {
    if (absDiff < limit) {
      return rtf.format(Math.round(diff / divisor), unit);
    }
  }
  return rtf.format(Math.round(diff / 31_536_000_000), 'year');
}
