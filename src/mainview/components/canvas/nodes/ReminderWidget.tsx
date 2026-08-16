import { AlarmClock, Bell, Check, CheckCircle2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { DatePicker } from '@/components/ui/DatePicker';
import { formatClock, formatDay, parseDate } from '@/lib/dateTime';
import { cn } from '@/lib/utils';
import type { ReminderWidgetData } from '@/lib/widgetTypes';
import { useAppSettingsStore } from '@/store/appSettingsStore';

import * as m from '../../../../paraglide/messages.js';

function reminderStatusLabel(status: ReminderWidgetData['status']): string {
  switch (status) {
    case 'scheduled':
      return m.widget_reminder_status_scheduled();
    case 'snoozed':
      return m.widget_reminder_status_snoozed();
    case 'done':
      return m.widget_reminder_status_done();
    case 'missed':
      return m.widget_reminder_status_missed();
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function reminderStatusTheme(status: ReminderWidgetData['status']): {
  ambient: string;
  chip: string;
  hero: string;
} {
  switch (status) {
    case 'scheduled':
      return {
        ambient:
          'bg-[radial-gradient(70%_55%_at_50%_18%,color-mix(in_oklch,var(--color-accent)_18%,transparent),transparent_72%)] dark:bg-[radial-gradient(70%_55%_at_50%_18%,color-mix(in_oklch,var(--color-accent)_28%,transparent),transparent_74%)]',
        chip: 'bg-accent-softer text-accent-strong ring-accent-soft/70',
        hero: 'text-neutral-900 dark:text-white',
      };
    case 'snoozed':
      return {
        ambient:
          'bg-[radial-gradient(70%_55%_at_50%_18%,rgba(245,158,11,0.16),transparent_72%)] dark:bg-[radial-gradient(70%_55%_at_50%_18%,rgba(251,191,36,0.20),transparent_74%)]',
        chip: 'bg-amber-50 text-amber-800 ring-amber-200/80 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-400/20',
        hero: 'text-amber-950 dark:text-amber-50',
      };
    case 'missed':
      return {
        ambient:
          'bg-[radial-gradient(70%_55%_at_50%_18%,rgba(244,63,94,0.14),transparent_72%)] dark:bg-[radial-gradient(70%_55%_at_50%_18%,rgba(251,113,133,0.22),transparent_74%)]',
        chip: 'bg-rose-50 text-rose-700 ring-rose-200/80 dark:bg-rose-400/10 dark:text-rose-100 dark:ring-rose-400/25',
        hero: 'text-rose-950 dark:text-rose-50',
      };
    case 'done':
      return {
        ambient:
          'bg-[radial-gradient(70%_55%_at_50%_18%,rgba(16,185,129,0.12),transparent_72%)] dark:bg-[radial-gradient(70%_55%_at_50%_18%,rgba(52,211,153,0.16),transparent_74%)]',
        chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-400/10 dark:text-emerald-100 dark:ring-emerald-400/20',
        hero: 'text-neutral-500 dark:text-white/50',
      };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function formatRelativeDue(value: string, nowMs = Date.now()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const diffMs = date.getTime() - nowMs;
  const absMs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < minute) {
    return diffMs >= 0
      ? m.widget_reminder_relative_now()
      : m.widget_reminder_relative_just_now();
  }
  if (absMs < hour) {
    const count = Math.round(absMs / minute);
    return diffMs >= 0
      ? m.widget_reminder_relative_in_minutes({ count })
      : m.widget_reminder_relative_minutes_ago({ count });
  }
  if (absMs < day * 2) {
    const count = Math.round(absMs / hour);
    return diffMs >= 0
      ? m.widget_reminder_relative_in_hours({ count })
      : m.widget_reminder_relative_hours_ago({ count });
  }
  const count = Math.round(absMs / day);
  return diffMs >= 0
    ? m.widget_reminder_relative_in_days({ count })
    : m.widget_reminder_relative_days_ago({ count });
}

function ActionButton({
  ariaLabel,
  children,
  onClick,
  tone,
}: {
  ariaLabel: string;
  children: ReactNode;
  onClick: () => void;
  tone: 'muted' | 'primary';
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        'nodrag nopan inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 font-medium text-xs transition-colors',
        tone === 'primary'
          ? 'bg-neutral-900 text-white hover:bg-neutral-800 dark:border dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15'
          : 'border border-black/10 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10'
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      type="button"
    >
      {children}
    </button>
  );
}

function ReminderHero({
  dueAt,
  locale,
  relativeLabel,
  status,
}: {
  dueAt: string;
  locale: 'en' | 'zh';
  relativeLabel: string;
  status: ReminderWidgetData['status'];
}) {
  const theme = reminderStatusTheme(status);
  const isDone = status === 'done';
  return (
    <span className="flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span
          className={cn(
            'block font-semibold text-[clamp(1.65rem,14cqw,2.35rem)] tabular-nums leading-none tracking-tight',
            theme.hero,
            isDone &&
              'line-through decoration-neutral-300 dark:decoration-white/20'
          )}
        >
          {formatClock(dueAt, locale)}
        </span>
        <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-neutral-500 text-sm dark:text-white/55">
            {formatDay(dueAt, locale)}
          </span>
          <span className="text-2xs text-neutral-400 uppercase tracking-[0.16em] dark:text-white/35">
            {relativeLabel}
          </span>
        </span>
      </span>
    </span>
  );
}

export function ReminderWidgetBody({
  data,
  onChange,
  onTitleChange,
  readOnly = false,
  title,
}: {
  data: ReminderWidgetData;
  onChange?: (
    updater: (data: ReminderWidgetData) => ReminderWidgetData
  ) => void;
  onTitleChange?: (title: string) => void;
  readOnly?: boolean;
  title: string;
}) {
  const locale = useAppSettingsStore((state) => state.locale);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const effectiveDue = data.snoozedUntil ?? data.dueAt;
  const theme = reminderStatusTheme(data.status);
  const isDone = data.status === 'done';
  const relativeLabel = isDone
    ? m.widget_reminder_relative_completed()
    : formatRelativeDue(effectiveDue, nowMs);
  const dueDate = useMemo(() => parseDate(effectiveDue), [effectiveDue]);
  const canEditDue = !(readOnly || isDone) && Boolean(onChange);

  useEffect(() => {
    if (isDone) {
      return;
    }
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [isDone]);

  return (
    <div className="@container relative flex h-full flex-col overflow-hidden bg-white p-5 text-neutral-900 dark:bg-[#0b0b0d] dark:text-white dark:ring-1 dark:ring-white/[0.06] dark:ring-inset">
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-3/4',
          theme.ambient
        )}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {readOnly || !onTitleChange ? (
              title ? (
                <h2 className="truncate font-semibold text-[15px] text-neutral-900 tracking-tight dark:text-white">
                  {title}
                </h2>
              ) : null
            ) : (
              <input
                aria-label={m.widget_reminder_title_aria()}
                className="nodrag nopan w-full border-none bg-transparent font-semibold text-[15px] text-neutral-900 tracking-tight outline-hidden placeholder:text-neutral-400 dark:text-white dark:placeholder:text-white/30"
                onChange={(event) => {
                  onTitleChange(event.target.value);
                }}
                placeholder={m.widget_reminder_title_placeholder()}
                value={title}
              />
            )}
            <div className="mt-1.5 flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 font-medium text-2xs ring-1 ring-inset',
                  theme.chip
                )}
              >
                {reminderStatusLabel(data.status)}
              </span>
              {data.status === 'snoozed' && data.snoozedUntil ? (
                <span className="truncate text-2xs text-neutral-400 dark:text-white/40">
                  {m.widget_reminder_snoozed_until({
                    time: formatClock(data.snoozedUntil, locale),
                  })}
                </span>
              ) : null}
            </div>
          </div>
          <div
            className={cn(
              'inline-flex size-9 shrink-0 items-center justify-center rounded-2xl border border-black/[0.06] bg-white/80 text-neutral-500 shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5 dark:text-white/55',
              isDone && 'text-emerald-600 dark:text-emerald-300'
            )}
          >
            {isDone ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <Bell className="size-4" />
            )}
          </div>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <ReminderHero
            dueAt={effectiveDue}
            locale={locale}
            relativeLabel={relativeLabel}
            status={data.status}
          />

          {canEditDue ? (
            <div className="mt-4">
              <DatePicker
                aria-label={m.widget_reminder_time_aria()}
                includeTime
                labels={{
                  placeholder: m.date_picker_placeholder(),
                  time: m.date_picker_time(),
                  today: m.date_picker_today(),
                  tomorrow: m.date_picker_tomorrow(),
                }}
                onChange={(next) => {
                  if (!next) {
                    return;
                  }
                  onChange?.((current) => ({
                    ...current,
                    dueAt: next.toISOString(),
                    snoozedUntil: undefined,
                    status: 'scheduled',
                  }));
                }}
                triggerClassName="rounded-2xl border-black/[0.06] bg-neutral-50/80 shadow-none hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
                value={dueDate}
              />
            </div>
          ) : null}

          {readOnly ? (
            data.note ? (
              <p className="mt-4 line-clamp-4 text-neutral-600 text-sm leading-relaxed dark:text-white/65">
                {data.note}
              </p>
            ) : null
          ) : (
            <label className="mt-4 grid min-h-0 flex-1 gap-1.5">
              <span className="sr-only">{m.widget_reminder_note_aria()}</span>
              <textarea
                aria-label={m.widget_reminder_note_aria()}
                className="nodrag nopan min-h-14 w-full flex-1 resize-none rounded-2xl border border-black/[0.06] bg-neutral-50/80 px-3 py-2.5 text-neutral-700 text-sm leading-relaxed outline-hidden transition-colors placeholder:text-neutral-400 focus:border-accent/40 focus:bg-white focus:ring-2 focus:ring-accent/20 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/80 dark:focus:border-accent/40 dark:focus:bg-white/[0.06] dark:placeholder:text-white/30"
                onChange={(event) => {
                  onChange?.((current) => ({
                    ...current,
                    note: event.target.value,
                  }));
                }}
                placeholder={m.widget_reminder_note_placeholder()}
                value={data.note ?? ''}
              />
            </label>
          )}
        </div>

        {readOnly || isDone ? null : (
          <div className="mt-4 flex items-center gap-2.5">
            <ActionButton
              ariaLabel={m.widget_reminder_snooze_aria()}
              onClick={() => {
                onChange?.((current) => ({
                  ...current,
                  status: 'snoozed',
                  snoozedUntil: new Date(
                    Date.now() + 10 * 60 * 1000
                  ).toISOString(),
                }));
              }}
              tone="muted"
            >
              <AlarmClock className="size-3.5 opacity-70" />
              {m.widget_reminder_snooze()}
            </ActionButton>
            <ActionButton
              ariaLabel={m.widget_reminder_done_aria()}
              onClick={() => {
                onChange?.((current) => ({
                  ...current,
                  status: 'done',
                }));
              }}
              tone="primary"
            >
              <Check className="size-3.5 opacity-90" />
              {m.widget_reminder_done()}
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );
}
