import {
  Clock3,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Square,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import {
  applyClockKind,
  applyPomodoroPause,
  applyPomodoroReset,
  applyPomodoroStart,
  applyStopwatchPause,
  applyStopwatchReset,
  applyStopwatchStart,
  applyStopwatchStop,
  clamp,
  clockKindOf,
  cyclePomodoroMode,
  elapsedStopwatchMs,
  formatClock,
  pomodoroProgress,
  remainingPomodoroMs,
  stopwatchOf,
  stopwatchProgress,
  visibleTimerState,
} from '@/lib/pomodoroTimer';
import { cn } from '@/lib/utils';
import type { PomodoroWidgetData } from '@/lib/widgetTypes';
import { useWidgetStore } from '@/store/widgetStore';
import * as m from '../../../../paraglide/messages.js';

const TIMER_TEAL = '#2a9d8f';
const TIMER_TICK = '#e6c36a';

type PomodoroDurationKey =
  | 'focusMinutes'
  | 'shortBreakMinutes'
  | 'longBreakMinutes'
  | 'sessionsBeforeLongBreak';

interface PomodoroSettingRow {
  key: PomodoroDurationKey;
  label: () => string;
  max: number;
  min: number;
  unit: () => string;
}

const POMODORO_SETTING_ROWS: PomodoroSettingRow[] = [
  {
    key: 'focusMinutes',
    label: () => m.widget_timer_setting_focus(),
    unit: () => m.widget_timer_unit_min(),
    min: 1,
    max: 90,
  },
  {
    key: 'shortBreakMinutes',
    label: () => m.widget_timer_setting_short_break(),
    unit: () => m.widget_timer_unit_min(),
    min: 1,
    max: 60,
  },
  {
    key: 'longBreakMinutes',
    label: () => m.widget_timer_setting_long_break(),
    unit: () => m.widget_timer_unit_min(),
    min: 1,
    max: 90,
  },
  {
    key: 'sessionsBeforeLongBreak',
    label: () => m.widget_timer_setting_long_after(),
    unit: () => m.widget_timer_unit_sessions(),
    min: 1,
    max: 12,
  },
];

function modeLabel(mode: PomodoroWidgetData['mode']): string {
  switch (mode) {
    case 'focus':
      return m.widget_timer_mode_focus();
    case 'shortBreak':
      return m.widget_timer_mode_short_break();
    case 'longBreak':
      return m.widget_timer_mode_long_break();
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function statusLabel(state: 'idle' | 'running' | 'paused'): string {
  switch (state) {
    case 'running':
      return m.widget_timer_status_running();
    case 'paused':
      return m.widget_timer_status_paused();
    default:
      return m.widget_timer_status_ready();
  }
}

function TimerRing({
  gradientId,
  progress,
}: {
  gradientId: string;
  progress: number;
}) {
  const radius = 52;
  const cx = 60;
  const cy = 60;
  const circumference = 2 * Math.PI * radius;
  const clamped = clamp(progress, 0, 1);
  const dashOffset = circumference * (1 - clamped);
  const angle = clamped * 2 * Math.PI - Math.PI / 2;
  const tickX = cx + radius * Math.cos(angle);
  const tickY = cy + radius * Math.sin(angle);

  return (
    <svg
      aria-hidden="true"
      className="size-full"
      fill="none"
      viewBox="0 0 120 120"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#3bb8a8" />
          <stop offset="100%" stopColor={TIMER_TEAL} />
        </linearGradient>
        <filter
          height="140%"
          id={`${gradientId}-glow`}
          width="140%"
          x="-20%"
          y="-20%"
        >
          <feGaussianBlur result="blur" stdDeviation="2.2" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle
        className="stroke-neutral-200 dark:stroke-white/10"
        cx={cx}
        cy={cy}
        r={radius}
        strokeWidth="7"
      />
      <circle
        className="transition-[stroke-dashoffset] duration-500 ease-linear"
        cx={cx}
        cy={cy}
        filter={`url(#${gradientId}-glow)`}
        r={radius}
        stroke={`url(#${gradientId})`}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth="7"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {clamped > 0 ? (
        <rect
          fill={TIMER_TICK}
          height="7"
          rx="1.2"
          transform={`rotate(${(angle * 180) / Math.PI + 45} ${tickX} ${tickY})`}
          width="7"
          x={tickX - 3.5}
          y={tickY - 3.5}
        />
      ) : null}
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
        <h3 className="font-semibold text-sm">{m.widget_timer_settings()}</h3>
        <button
          aria-label={m.widget_timer_close_settings_aria()}
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
              {row.label()}
            </span>
            <div className="flex items-center gap-1.5">
              <StepperButton
                ariaLabel={m.widget_timer_decrease_aria({ label: row.label() })}
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
                  {row.unit()}
                </span>
              </span>
              <StepperButton
                ariaLabel={m.widget_timer_increase_aria({ label: row.label() })}
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

function ClockTab({
  active,
  label,
  onSelect,
  ariaLabel,
}: {
  active: boolean;
  ariaLabel: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-selected={active}
      className={cn(
        'nodrag nopan inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-full px-2 font-medium text-2xs transition-colors',
        active
          ? 'bg-[#2a9d8f] text-white shadow-[0_6px_14px_rgba(42,157,143,0.28)]'
          : 'text-neutral-500 hover:text-neutral-700 dark:text-white/55 dark:hover:text-white'
      )}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      role="tab"
      type="button"
    >
      <Clock3 className="size-3 shrink-0 opacity-80" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function ActionChip({
  ariaLabel,
  children,
  disabled,
  onClick,
  tone,
}: {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone: 'ghost' | 'muted' | 'primary';
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        'nodrag nopan inline-flex h-9 items-center justify-center gap-1 rounded-full px-3 font-medium text-xs transition-colors disabled:cursor-default disabled:opacity-40',
        tone === 'primary' &&
          'min-w-[5.5rem] bg-[#2a9d8f] text-white shadow-[0_8px_18px_rgba(42,157,143,0.32)] hover:bg-[#23897d]',
        tone === 'muted' &&
          'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/80 dark:bg-white/8 dark:text-white/75 dark:hover:bg-white/12',
        tone === 'ghost' &&
          'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/60 dark:hover:bg-white/8 dark:hover:text-white'
      )}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) {
          onClick();
        }
      }}
      type="button"
    >
      {children}
    </button>
  );
}

export function PomodoroWidgetBody({
  data,
  onChange,
  onCompleteIfDue,
  readOnly = false,
  widgetId,
}: {
  data: PomodoroWidgetData;
  onChange?: (
    updater: (data: PomodoroWidgetData) => PomodoroWidgetData
  ) => void;
  onCompleteIfDue?: () => void;
  readOnly?: boolean;
  widgetId: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showSettings, setShowSettings] = useState(false);
  const clockKind = clockKindOf(data);
  const isStopwatch = clockKind === 'stopwatch';
  const stopwatch = stopwatchOf(data);
  const remainingMs = remainingPomodoroMs(data, nowMs);
  const elapsedMs = elapsedStopwatchMs(stopwatch, nowMs);
  const displayMs = isStopwatch ? elapsedMs : remainingMs;
  const progress = isStopwatch
    ? stopwatchProgress(stopwatch, nowMs)
    : pomodoroProgress(data, nowMs);
  const timerState = visibleTimerState(data);
  const pomodoroRunning = data.timer.state === 'running';
  const completePomodoroIfDue = useWidgetStore((s) => s.completePomodoroIfDue);

  useEffect(() => {
    if (!(pomodoroRunning || (isStopwatch && stopwatch.state === 'running'))) {
      return;
    }
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, [isStopwatch, pomodoroRunning, stopwatch.state]);

  useEffect(() => {
    if (readOnly || !(pomodoroRunning && remainingMs === 0)) {
      return;
    }
    if (onCompleteIfDue) {
      onCompleteIfDue();
      return;
    }
    completePomodoroIfDue(widgetId);
  }, [
    readOnly,
    pomodoroRunning,
    remainingMs,
    widgetId,
    onCompleteIfDue,
    completePomodoroIfDue,
  ]);

  const sessionsPerCycle = Math.max(
    1,
    Math.round(data.sessionsBeforeLongBreak)
  );
  const completedInCycle = data.completedSessions % sessionsPerCycle;
  const dotCount = Math.min(sessionsPerCycle, 8);
  const gradientId = `timer-arc-${widgetId}`;
  const clockLabel = isStopwatch
    ? m.widget_timer_stopwatch()
    : modeLabel(data.mode);

  const primary =
    timerState === 'running'
      ? {
          label: m.widget_timer_pause(),
          ariaLabel: m.widget_timer_pause_aria(),
          icon: Pause,
          apply: isStopwatch ? applyStopwatchPause : applyPomodoroPause,
        }
      : timerState === 'paused'
        ? {
            label: m.widget_timer_resume(),
            ariaLabel: m.widget_timer_resume_aria(),
            icon: Play,
            apply: isStopwatch ? applyStopwatchStart : applyPomodoroStart,
          }
        : {
            label: m.widget_timer_start(),
            ariaLabel: m.widget_timer_start_aria(),
            icon: Play,
            apply: isStopwatch ? applyStopwatchStart : applyPomodoroStart,
          };

  const canReset = isStopwatch
    ? stopwatch.state !== 'idle'
    : data.timer.state !== 'idle';
  const canStop = canReset;
  const PrimaryIcon = primary.icon;

  return (
    <div className="@container relative flex h-full flex-col overflow-hidden bg-white p-4 text-neutral-900 dark:bg-[#0b0b0d] dark:text-white dark:ring-1 dark:ring-white/[0.06] dark:ring-inset">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-3/4 bg-[radial-gradient(60%_55%_at_50%_38%,rgba(42,157,143,0.14),transparent_72%)] dark:bg-[radial-gradient(60%_55%_at_50%_38%,rgba(42,157,143,0.22),transparent_74%)]" />
      {showSettings && !readOnly && onChange && !isStopwatch ? (
        <PomodoroSettingsPanel
          data={data}
          onChange={onChange}
          onClose={() => setShowSettings(false)}
        />
      ) : (
        <div className="relative flex h-full flex-col">
          <div
            className="mx-auto flex w-full max-w-[14.5rem] rounded-full bg-neutral-100 p-1 dark:bg-white/8"
            role="tablist"
          >
            <ClockTab
              active={!isStopwatch}
              ariaLabel={m.widget_timer_switch_pomodoro_aria()}
              label={m.widget_timer_pomodoro()}
              onSelect={() => {
                if (readOnly || !onChange) {
                  return;
                }
                setShowSettings(false);
                onChange((current) => applyClockKind(current, 'pomodoro'));
              }}
            />
            <ClockTab
              active={isStopwatch}
              ariaLabel={m.widget_timer_switch_stopwatch_aria()}
              label={m.widget_timer_stopwatch()}
              onSelect={() => {
                if (readOnly || !onChange) {
                  return;
                }
                setShowSettings(false);
                onChange((current) => applyClockKind(current, 'stopwatch'));
              }}
            />
          </div>

          <div className="relative grid min-h-0 flex-1 place-items-center">
            <div className="relative aspect-square w-[min(72%,10.75rem)]">
              <TimerRing gradientId={gradientId} progress={progress} />
              <div className="absolute inset-[16%] flex flex-col items-center justify-center gap-1.5 text-center">
                {isStopwatch ||
                readOnly ||
                !onChange ||
                data.timer.state !== 'idle' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#2a9d8f]/10 px-2 py-0.5 font-medium text-2xs text-[#1f7f74] dark:bg-[#2a9d8f]/15 dark:text-[#7ad4c6]">
                    <Clock3 className="size-3 opacity-80" />
                    {clockLabel}
                  </span>
                ) : (
                  <button
                    aria-label={m.widget_timer_cycle_mode_aria()}
                    className="nodrag nopan inline-flex items-center gap-1 rounded-full bg-[#2a9d8f]/10 px-2 py-0.5 font-medium text-2xs text-[#1f7f74] transition-colors hover:bg-[#2a9d8f]/16 dark:bg-[#2a9d8f]/15 dark:text-[#7ad4c6]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onChange(cyclePomodoroMode);
                    }}
                    type="button"
                  >
                    <Clock3 className="size-3 opacity-80" />
                    {clockLabel}
                  </button>
                )}
                <div className="font-semibold text-[#1f7f74] text-[clamp(1.45rem,13cqw,2.1rem)] tabular-nums leading-none tracking-tight dark:text-[#7ad4c6]">
                  {formatClock(displayMs, isStopwatch ? 'floor' : 'ceil')}
                </div>
                {isStopwatch ? null : (
                  <div aria-hidden="true" className="flex items-center gap-1">
                    {Array.from({ length: dotCount }, (_, index) => (
                      <span
                        className={cn(
                          'h-1.5 w-1 rounded-full transition-colors',
                          index < completedInCycle
                            ? 'bg-[#2a9d8f]'
                            : 'bg-neutral-200 dark:bg-white/15'
                        )}
                        key={index}
                      />
                    ))}
                  </div>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-2xs text-neutral-500 ring-1 ring-black/5 dark:bg-white/5 dark:text-white/55 dark:ring-white/10">
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      timerState === 'running'
                        ? 'bg-[#2a9d8f]'
                        : timerState === 'paused'
                          ? 'bg-amber-400'
                          : 'bg-neutral-300 dark:bg-white/25'
                    )}
                  />
                  {statusLabel(timerState)}
                </span>
              </div>
            </div>
          </div>

          {readOnly ? null : (
            <div className="mt-1 flex items-center justify-center gap-2">
              <ActionChip
                ariaLabel={m.widget_timer_reset_aria()}
                disabled={!canReset}
                onClick={() =>
                  onChange?.(
                    isStopwatch ? applyStopwatchReset : applyPomodoroReset
                  )
                }
                tone="muted"
              >
                <RotateCcw className="size-3.5" />
                <span>{m.widget_timer_reset()}</span>
              </ActionChip>
              <ActionChip
                ariaLabel={primary.ariaLabel}
                onClick={() => onChange?.((current) => primary.apply(current))}
                tone="primary"
              >
                <PrimaryIcon className="size-3.5" />
                <span>{primary.label}</span>
              </ActionChip>
              {isStopwatch ? (
                <ActionChip
                  ariaLabel={m.widget_timer_stop_aria()}
                  disabled={!canStop}
                  onClick={() => onChange?.(applyStopwatchStop)}
                  tone="ghost"
                >
                  <Square className="size-2.5 fill-current" />
                  <span>{m.widget_timer_stop()}</span>
                </ActionChip>
              ) : (
                <ActionChip
                  ariaLabel={m.widget_timer_settings_aria()}
                  onClick={() => setShowSettings(true)}
                  tone="ghost"
                >
                  <Settings className="size-3.5" />
                  <span>{m.widget_timer_settings()}</span>
                </ActionChip>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
