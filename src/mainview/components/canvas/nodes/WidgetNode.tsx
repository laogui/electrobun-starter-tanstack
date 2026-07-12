import {
  AlarmClock,
  Bell,
  Check,
  CheckCircle2,
  Coffee,
  Eye,
  ListChecks,
  Minus,
  Plus,
  RotateCcw,
  Settings,
  X,
} from 'lucide-react';
import { memo, type ReactNode, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  ChecklistWidgetData,
  PomodoroWidgetData,
  ReminderWidgetData,
  WidgetKind,
} from '@/lib/widgetTypes';
import { isWidgetLoadError } from '@/lib/widgetTypes';
import { useWidgetStore } from '@/store/widgetStore';
import { NodeHandles } from './_shared/NodeHandles';
import { ResizeHandle } from './_shared/ResizeHandle';

export interface WidgetNodeData {
  kind: WidgetKind;
  widgetId: string;
}

function generateItemId(): string {
  return `item_${crypto.randomUUID().slice(0, 8)}`;
}

function durationForPomodoroMode(data: PomodoroWidgetData): number {
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

function remainingPomodoroMs(
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

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDueClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDueDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** Compact relative label for the hero time, e.g. "in 15m" / "2h ago" / "Due now". */
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
    return diffMs >= 0 ? 'Due now' : 'Just now';
  }
  if (absMs < hour) {
    const minutes = Math.round(absMs / minute);
    return diffMs >= 0 ? `in ${minutes}m` : `${minutes}m ago`;
  }
  if (absMs < day * 2) {
    const hours = Math.round(absMs / hour);
    return diffMs >= 0 ? `in ${hours}h` : `${hours}h ago`;
  }
  const days = Math.round(absMs / day);
  return diffMs >= 0 ? `in ${days}d` : `${days}d ago`;
}

function toDateTimeLocalValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function reminderStatusLabel(status: ReminderWidgetData['status']): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'snoozed':
      return 'Snoozed';
    case 'done':
      return 'Done';
    case 'missed':
      return 'Missed';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Status-driven palette for the reminder card ambient glow + chip. */
function reminderStatusTheme(status: ReminderWidgetData['status']): {
  ambient: string;
  chip: string;
  hero: string;
} {
  switch (status) {
    case 'scheduled':
      return {
        ambient:
          'bg-[radial-gradient(70%_55%_at_50%_18%,rgba(99,102,241,0.14),transparent_72%)] dark:bg-[radial-gradient(70%_55%_at_50%_18%,rgba(129,140,248,0.22),transparent_74%)]',
        chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200/70 dark:bg-indigo-400/10 dark:text-indigo-200 dark:ring-indigo-400/20',
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

function IconButton({
  ariaLabel,
  children,
  className,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        'nodrag nopan inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white',
        className
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      type="button"
    >
      {children}
    </button>
  );
}

function WidgetFallback({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-3xl border border-black/5 border-dashed p-6 text-center text-neutral-500 text-sm">
      <ListChecks className="opacity-50" size={20} />
      <div className="font-medium">{title}</div>
      <div className="text-xs opacity-70">{message}</div>
    </div>
  );
}

function ChecklistWidgetBody({
  nodeId,
  readOnly = false,
  title,
  data,
  onChange,
}: {
  data: ChecklistWidgetData;
  nodeId: string;
  onChange?: (
    updater: (data: ChecklistWidgetData) => ChecklistWidgetData
  ) => void;
  readOnly?: boolean;
  title: string;
}) {
  const [newItem, setNewItem] = useState('');

  return (
    <div className="flex h-full flex-col p-6">
      {title ? <h2 className="mb-4 font-bold text-xl">{title}</h2> : null}
      <div className="flex-1 space-y-1 overflow-hidden">
        {data.items.map((item) => (
          <button
            className={cn(
              'nodrag nopan group flex w-full items-start gap-3 py-1 text-left',
              readOnly ? '' : 'cursor-pointer'
            )}
            disabled={readOnly}
            key={item.id}
            onClick={
              readOnly
                ? undefined
                : (e) => {
                    e.stopPropagation();
                    onChange?.((record) => ({
                      items: record.items.map((entry) =>
                        entry.id === item.id
                          ? {
                              ...entry,
                              checked: !entry.checked,
                              completedAt: entry.checked
                                ? undefined
                                : new Date().toISOString(),
                            }
                          : entry
                      ),
                    }));
                  }
            }
            type="button"
          >
            <div
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
                item.checked
                  ? 'border-neutral-950 bg-neutral-950'
                  : 'border-gray-400 group-hover:border-black'
              )}
            >
              {item.checked ? <Check className="text-white" size={12} /> : null}
            </div>
            <span
              className={cn(
                'text-sm/tight transition-colors',
                item.checked ? 'text-gray-400 line-through' : 'text-gray-800'
              )}
            >
              {item.text}
            </span>
          </button>
        ))}
        {readOnly ? null : (
          <div
            className="mt-2 flex items-center gap-3 opacity-50 transition-opacity focus-within:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <Plus className="size-4 shrink-0 text-gray-400" />
            <input
              aria-label="New checklist item"
              className="nodrag nopan w-full border-none bg-transparent text-sm placeholder-gray-500 outline-hidden"
              data-testid={`widget-new-item-${nodeId}`}
              onChange={(e) => {
                setNewItem(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newItem.trim() && onChange) {
                  onChange((record) => ({
                    items: [
                      ...record.items,
                      {
                        id: generateItemId(),
                        text: newItem.trim(),
                        checked: false,
                        createdAt: new Date().toISOString(),
                      },
                    ],
                  }));
                  setNewItem('');
                }
              }}
              placeholder="Add item..."
              type="text"
              value={newItem}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type PomodoroDurationKey =
  | 'focusMinutes'
  | 'shortBreakMinutes'
  | 'longBreakMinutes'
  | 'sessionsBeforeLongBreak';

interface PomodoroSettingRow {
  key: PomodoroDurationKey;
  label: string;
  max: number;
  min: number;
  unit: string;
}

const POMODORO_SETTING_ROWS: PomodoroSettingRow[] = [
  { key: 'focusMinutes', label: 'Focus session', unit: 'min', min: 1, max: 90 },
  {
    key: 'shortBreakMinutes',
    label: 'Short break',
    unit: 'min',
    min: 1,
    max: 60,
  },
  {
    key: 'longBreakMinutes',
    label: 'Long break',
    unit: 'min',
    min: 1,
    max: 90,
  },
  {
    key: 'sessionsBeforeLongBreak',
    label: 'Long break after',
    unit: 'sess.',
    min: 1,
    max: 12,
  },
];

/** Maps the timer state to the label, a11y name, and store update for the
 * single primary START / PAUSE / RESUME pill in the new design. */
function pomodoroPrimaryAction(
  state: PomodoroWidgetData['timer']['state'],
  remainingMs: number
): {
  apply: (current: PomodoroWidgetData) => PomodoroWidgetData;
  ariaLabel: string;
  label: string;
} {
  switch (state) {
    case 'idle':
      return {
        label: 'Start',
        ariaLabel: 'Start timer',
        apply: (current) => ({
          ...current,
          timer: {
            state: 'running',
            startedAt: new Date().toISOString(),
            durationMs: durationForPomodoroMode(current),
          },
        }),
      };
    case 'running':
      return {
        label: 'Pause',
        ariaLabel: 'Pause timer',
        apply: (current) => ({
          ...current,
          timer: {
            state: 'paused',
            remainingMs: remainingPomodoroMs(current),
          },
        }),
      };
    case 'paused':
      return {
        label: 'Resume',
        ariaLabel: 'Resume timer',
        apply: (current) => {
          const pausedRemaining =
            current.timer.state === 'paused'
              ? current.timer.remainingMs
              : remainingMs;
          return {
            ...current,
            timer: {
              state: 'running',
              startedAt: new Date().toISOString(),
              durationMs: pausedRemaining,
            },
          };
        },
      };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/** Circular countdown ring. `progress` is the elapsed fraction (0 → 1): the
 * warm gradient arc grows clockwise from the top as time is spent. */
function PomodoroRing({
  gradientId,
  progress,
}: {
  gradientId: string;
  progress: number;
}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamp(progress, 0, 1));
  return (
    <svg
      aria-hidden="true"
      className="size-full -rotate-90"
      fill="none"
      viewBox="0 0 120 120"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" x2="100%" y1="100%" y2="0%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="55%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      <circle
        className="stroke-black/[0.04] dark:stroke-white/[0.05]"
        cx="60"
        cy="60"
        r="40"
        strokeWidth="1"
      />
      <circle
        className="stroke-black/[0.04] dark:stroke-white/[0.04]"
        cx="60"
        cy="60"
        r="26"
        strokeWidth="1"
      />
      <circle
        className="stroke-neutral-200 dark:stroke-white/10"
        cx="60"
        cy="60"
        r={radius}
        strokeWidth="5"
      />
      <circle
        className="drop-shadow-[0_0_6px_rgba(249,115,22,0.45)] transition-[stroke-dashoffset] duration-500 ease-linear"
        cx="60"
        cy="60"
        r={radius}
        stroke={`url(#${gradientId})`}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth="5"
      />
    </svg>
  );
}

function StepperButton({
  ariaLabel,
  children,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="nodrag nopan inline-flex size-7 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
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

function PomodoroSettingsPanel({
  data,
  onChange,
  onClose,
}: {
  data: PomodoroWidgetData;
  onChange: (updater: (data: PomodoroWidgetData) => PomodoroWidgetData) => void;
  onClose: () => void;
}) {
  return (
    <div className="relative flex h-full flex-col">
      <div className="relative mb-3 flex items-center justify-center">
        <h3 className="font-semibold text-sm">Settings</h3>
        <button
          aria-label="Close settings"
          className="nodrag nopan absolute right-0 inline-flex size-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          type="button"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-0.5">
        {POMODORO_SETTING_ROWS.map((row) => (
          <div
            className="flex items-center justify-between gap-2 rounded-2xl px-1 py-1.5"
            key={row.key}
          >
            <span className="text-neutral-600 text-sm dark:text-white/70">
              {row.label}
            </span>
            <div className="flex items-center gap-1.5">
              <StepperButton
                ariaLabel={`Decrease ${row.label}`}
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    [row.key]: clamp(current[row.key] - 1, row.min, row.max),
                  }))
                }
              >
                <Minus className="size-3.5" />
              </StepperButton>
              <span className="w-14 text-center text-sm tabular-nums">
                <span className="font-semibold">
                  {data[row.key].toString().padStart(2, '0')}
                </span>{' '}
                <span className="text-2xs text-neutral-400 dark:text-white/40">
                  {row.unit}
                </span>
              </span>
              <StepperButton
                ariaLabel={`Increase ${row.label}`}
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    [row.key]: clamp(current[row.key] + 1, row.min, row.max),
                  }))
                }
              >
                <Plus className="size-3.5" />
              </StepperButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PomodoroWidgetBody({
  data,
  onChange,
  readOnly = false,
  widgetId,
}: {
  data: PomodoroWidgetData;
  onChange?: (
    updater: (data: PomodoroWidgetData) => PomodoroWidgetData
  ) => void;
  readOnly?: boolean;
  widgetId: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showSettings, setShowSettings] = useState(false);
  const remainingMs = remainingPomodoroMs(data, nowMs);
  const totalMs = durationForPomodoroMode(data);
  const progress = totalMs > 0 ? 1 - remainingMs / totalMs : 0;
  const isRunning = data.timer.state === 'running';
  const completePomodoroIfDue = useWidgetStore((s) => s.completePomodoroIfDue);

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [isRunning]);

  // Auto-complete an expired running timer. The completion decision lives in
  // the store action (guarded by `timer.state === 'running'`), so a repeated
  // trigger from this effect (e.g. React Strict Mode double invocation) is a
  // no-op rather than double-counting a session. Read-only previews must never
  // mutate the live store or schedule a disk save.
  useEffect(() => {
    if (readOnly || !(isRunning && remainingMs === 0)) {
      return;
    }
    completePomodoroIfDue(widgetId);
  }, [readOnly, isRunning, remainingMs, widgetId, completePomodoroIfDue]);

  const isBreak = data.mode !== 'focus';
  const modeLabel =
    data.mode === 'focus'
      ? 'Focus'
      : data.mode === 'shortBreak'
        ? 'Short break'
        : 'Long break';
  const ModeIcon = isBreak ? Coffee : Eye;

  const sessionsPerCycle = Math.max(
    1,
    Math.round(data.sessionsBeforeLongBreak)
  );
  const completedInCycle = data.completedSessions % sessionsPerCycle;
  const dotCount = Math.min(sessionsPerCycle, 8);

  const primary = pomodoroPrimaryAction(data.timer.state, remainingMs);
  const gradientId = `pomodoro-arc-${widgetId}`;

  return (
    <div className="@container relative flex h-full flex-col overflow-hidden bg-white p-5 text-neutral-900 dark:bg-[#0b0b0d] dark:text-white dark:ring-1 dark:ring-white/[0.06] dark:ring-inset">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-3/4 bg-[radial-gradient(60%_55%_at_50%_32%,rgba(249,115,22,0.10),transparent_70%)] dark:bg-[radial-gradient(60%_55%_at_50%_32%,rgba(249,115,22,0.20),transparent_72%)]" />
      {showSettings && !readOnly && onChange ? (
        <PomodoroSettingsPanel
          data={data}
          onChange={onChange}
          onClose={() => setShowSettings(false)}
        />
      ) : (
        <div className="relative flex h-full flex-col">
          <div className="relative grid min-h-0 flex-1 place-items-center">
            <PomodoroRing gradientId={gradientId} progress={progress} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
              <ModeIcon className="size-4 text-neutral-400 dark:text-white/45" />
              <div className="font-semibold text-[clamp(1.75rem,15cqw,3rem)] text-neutral-900 tabular-nums leading-none tracking-tight dark:text-white">
                {formatDuration(remainingMs)}
              </div>
              <div aria-hidden="true" className="flex items-center gap-1">
                {Array.from({ length: dotCount }, (_, index) => (
                  <span
                    className={cn(
                      'h-2.5 w-1 rounded-full transition-colors',
                      index < completedInCycle
                        ? 'bg-gradient-to-b from-orange-400 to-red-500'
                        : 'bg-neutral-200 dark:bg-white/15'
                    )}
                    key={index}
                  />
                ))}
              </div>
              <div className="text-2xs text-neutral-400 uppercase tracking-[0.22em] dark:text-white/40">
                {modeLabel}
              </div>
            </div>
          </div>
          {readOnly ? null : (
            <div className="mt-4 flex items-center gap-3">
              <IconButton
                ariaLabel="Reset timer"
                onClick={() =>
                  onChange?.((current) => ({
                    ...current,
                    timer: { state: 'idle' },
                  }))
                }
              >
                <RotateCcw className="size-4" />
              </IconButton>
              <button
                aria-label={primary.ariaLabel}
                className="nodrag nopan h-10 flex-1 rounded-full bg-neutral-900 font-medium text-sm text-white uppercase tracking-wide transition-colors hover:bg-neutral-800 dark:border dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange?.(primary.apply);
                }}
                type="button"
              >
                {primary.label}
              </button>
              <IconButton
                ariaLabel="Timer settings"
                onClick={() => setShowSettings(true)}
              >
                <Settings className="size-4" />
              </IconButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReminderWidgetBody({
  data,
  onChange,
  readOnly = false,
  title,
}: {
  data: ReminderWidgetData;
  onChange?: (
    updater: (data: ReminderWidgetData) => ReminderWidgetData
  ) => void;
  readOnly?: boolean;
  title: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const effectiveDue = data.snoozedUntil ?? data.dueAt;
  const theme = reminderStatusTheme(data.status);
  const isDone = data.status === 'done';
  const relativeLabel = isDone
    ? 'Completed'
    : formatRelativeDue(effectiveDue, nowMs);

  // Refresh relative labels while the card is open (not while done).
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
          <div className="min-w-0">
            {title ? (
              <h2 className="truncate font-semibold text-[15px] text-neutral-900 tracking-tight dark:text-white">
                {title}
              </h2>
            ) : null}
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
                  until {formatDueClock(data.snoozedUntil)}
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
          <div className="flex flex-col items-start gap-1">
            <div
              className={cn(
                'font-semibold text-[clamp(1.65rem,14cqw,2.35rem)] tabular-nums leading-none tracking-tight',
                theme.hero,
                isDone &&
                  'line-through decoration-neutral-300 dark:decoration-white/20'
              )}
            >
              {formatDueClock(effectiveDue)}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-neutral-500 text-sm dark:text-white/55">
                {formatDueDay(effectiveDue)}
              </span>
              <span className="text-2xs text-neutral-400 uppercase tracking-[0.16em] dark:text-white/35">
                {relativeLabel}
              </span>
            </div>
          </div>

          {readOnly ? (
            data.note ? (
              <p className="mt-4 line-clamp-4 text-neutral-600 text-sm leading-relaxed dark:text-white/65">
                {data.note}
              </p>
            ) : null
          ) : (
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2.5">
              <label className="group grid gap-1.5">
                <span className="sr-only">Reminder time</span>
                <div className="flex items-center gap-2 rounded-2xl border border-black/[0.06] bg-neutral-50/80 px-3 py-2 transition-colors focus-within:border-indigo-300/70 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-200/50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:focus-within:border-indigo-400/40 dark:focus-within:bg-white/[0.06] dark:focus-within:ring-indigo-400/20">
                  <AlarmClock className="size-3.5 shrink-0 text-neutral-400 dark:text-white/40" />
                  <input
                    aria-label="Reminder time"
                    className="nodrag nopan w-full border-none bg-transparent text-neutral-800 text-xs outline-hidden dark:text-white/90 dark:[color-scheme:dark]"
                    onChange={(event) => {
                      const nextDate = new Date(event.target.value);
                      if (Number.isNaN(nextDate.getTime())) {
                        return;
                      }
                      onChange?.((current) => ({
                        ...current,
                        dueAt: nextDate.toISOString(),
                        snoozedUntil: undefined,
                        status: 'scheduled',
                      }));
                    }}
                    type="datetime-local"
                    value={toDateTimeLocalValue(data.dueAt)}
                  />
                </div>
              </label>
              <label className="grid min-h-0 flex-1 gap-1.5">
                <span className="sr-only">Reminder note</span>
                <textarea
                  aria-label="Reminder note"
                  className="nodrag nopan min-h-14 w-full flex-1 resize-none rounded-2xl border border-black/[0.06] bg-neutral-50/80 px-3 py-2.5 text-neutral-700 text-sm leading-relaxed outline-hidden transition-colors placeholder:text-neutral-400 focus:border-indigo-300/70 focus:bg-white focus:ring-2 focus:ring-indigo-200/50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/80 dark:focus:border-indigo-400/40 dark:focus:bg-white/[0.06] dark:focus:ring-indigo-400/20 dark:placeholder:text-white/30"
                  onChange={(event) => {
                    onChange?.((current) => ({
                      ...current,
                      note: event.target.value,
                    }));
                  }}
                  placeholder="Add a note…"
                  value={data.note ?? ''}
                />
              </label>
            </div>
          )}
        </div>

        {readOnly || isDone ? null : (
          <div className="mt-4 flex items-center gap-2.5">
            <button
              aria-label="Snooze 10 minutes"
              className="nodrag nopan inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-black/10 bg-white font-medium text-neutral-700 text-xs transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
              onClick={(event) => {
                event.stopPropagation();
                onChange?.((current) => ({
                  ...current,
                  status: 'snoozed',
                  snoozedUntil: new Date(
                    Date.now() + 10 * 60 * 1000
                  ).toISOString(),
                }));
              }}
              type="button"
            >
              <AlarmClock className="size-3.5 opacity-70" />
              Snooze 10m
            </button>
            <button
              aria-label="Mark reminder done"
              className="nodrag nopan inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-neutral-900 font-medium text-sm text-white transition-colors hover:bg-neutral-800 dark:border dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              onClick={(event) => {
                event.stopPropagation();
                onChange?.((current) => ({
                  ...current,
                  status: 'done',
                }));
              }}
              type="button"
            >
              <Check className="size-3.5 opacity-90" />
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WidgetNode({ id, data }: { data: WidgetNodeData; id: string }) {
  const record = useWidgetStore((s) => s.records[data.widgetId]);
  const updateWidget = useWidgetStore((s) => s.updateWidget);

  if (!record) {
    return (
      <div className="size-full">
        <NodeHandles />
        <WidgetFallback
          message="This widget could not be found."
          title="Missing widget"
        />
      </div>
    );
  }

  if (isWidgetLoadError(record)) {
    return (
      <div className="size-full">
        <NodeHandles />
        <WidgetFallback
          message={
            record.error === 'corrupted'
              ? 'The widget file is corrupted.'
              : 'The widget file is missing.'
          }
          title="Broken widget"
        />
      </div>
    );
  }

  return (
    <div className="group/widget size-full">
      <ResizeHandle
        hoverClassName="group-hover/widget:opacity-100"
        maxHeight={900}
        maxWidth={800}
        minHeight={220}
        minWidth={220}
        nodeId={id}
      />
      <NodeHandles />
      <div className="node-visual size-full cursor-pointer overflow-hidden rounded-3xl border border-black/5 bg-white shadow-card transition-shadow duration-200 ease-out hover:shadow-card-hover">
        {record.kind === 'checklist' ? (
          <ChecklistWidgetBody
            data={record.data as ChecklistWidgetData}
            nodeId={id}
            onChange={(updater) => {
              updateWidget(data.widgetId, (current) => ({
                ...current,
                data: updater(current.data as ChecklistWidgetData),
                updatedAt: new Date().toISOString(),
              }));
            }}
            title={record.title}
          />
        ) : null}
        {record.kind === 'pomodoro' ? (
          <PomodoroWidgetBody
            data={record.data as PomodoroWidgetData}
            onChange={(updater) => {
              updateWidget(
                data.widgetId,
                (current) => ({
                  ...current,
                  data: updater(current.data as PomodoroWidgetData),
                  updatedAt: new Date().toISOString(),
                }),
                { recordHistory: false }
              );
            }}
            widgetId={data.widgetId}
          />
        ) : null}
        {record.kind === 'reminder' ? (
          <ReminderWidgetBody
            data={record.data as ReminderWidgetData}
            onChange={(updater) => {
              updateWidget(data.widgetId, (current) => ({
                ...current,
                data: updater(current.data as ReminderWidgetData),
                updatedAt: new Date().toISOString(),
              }));
            }}
            title={record.title}
          />
        ) : null}
      </div>
    </div>
  );
}

export default memo(WidgetNode);

export function WidgetNodeReadOnly({ data }: { data: WidgetNodeData }) {
  const record = useWidgetStore((s) => s.records[data.widgetId]);

  if (!record || isWidgetLoadError(record)) {
    return (
      <div className="size-full">
        <NodeHandles />
        <div className="node-visual size-full overflow-hidden rounded-3xl border border-black/5 shadow-card">
          <WidgetFallback
            message="Widget preview is not available."
            title={data.kind === 'checklist' ? 'Checklist' : data.kind}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="size-full">
      <NodeHandles />
      <div className="node-visual size-full overflow-hidden rounded-3xl border border-black/5 shadow-card">
        {record.kind === 'checklist' ? (
          <ChecklistWidgetBody
            data={record.data as ChecklistWidgetData}
            nodeId={data.widgetId}
            readOnly
            title={record.title}
          />
        ) : null}
        {record.kind === 'pomodoro' ? (
          <PomodoroWidgetBody
            data={record.data as PomodoroWidgetData}
            readOnly
            widgetId={data.widgetId}
          />
        ) : null}
        {record.kind === 'reminder' ? (
          <ReminderWidgetBody
            data={record.data as ReminderWidgetData}
            readOnly
            title={record.title}
          />
        ) : null}
      </div>
    </div>
  );
}
