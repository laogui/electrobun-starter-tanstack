import {
  Bell,
  Check,
  CheckCircle2,
  Clock3,
  ListChecks,
  Pause,
  Play,
  Plus,
  RotateCcw,
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

function formatDueAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
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

function IconButton({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn(
        'nodrag nopan inline-flex size-9 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50',
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

function PomodoroWidgetBody({
  data,
  onChange,
  readOnly = false,
  title,
  widgetId,
}: {
  data: PomodoroWidgetData;
  onChange?: (
    updater: (data: PomodoroWidgetData) => PomodoroWidgetData
  ) => void;
  readOnly?: boolean;
  title: string;
  widgetId: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const remainingMs = remainingPomodoroMs(data, nowMs);
  const isRunning = data.timer.state === 'running';
  const isPaused = data.timer.state === 'paused';
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

  const modeLabel =
    data.mode === 'focus'
      ? 'Focus'
      : data.mode === 'shortBreak'
        ? 'Short break'
        : 'Long break';

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-bold text-lg text-neutral-900">
            {title}
          </h2>
          <div className="mt-1 text-neutral-500 text-xs">{modeLabel}</div>
        </div>
        <Clock3 className="size-5 shrink-0 text-neutral-400" />
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <div className="font-semibold text-5xl text-neutral-950 tabular-nums tracking-normal">
          {formatDuration(remainingMs)}
        </div>
        <div className="mt-2 text-neutral-500 text-xs">
          {data.completedSessions} completed
        </div>
      </div>
      {readOnly ? null : (
        <div className="mt-5 flex items-center gap-2">
          {data.timer.state === 'idle' ? (
            <IconButton
              className="bg-neutral-950 text-white hover:bg-neutral-800"
              onClick={() => {
                onChange?.((current) => ({
                  ...current,
                  timer: {
                    state: 'running',
                    startedAt: new Date().toISOString(),
                    durationMs: durationForPomodoroMode(current),
                  },
                }));
              }}
            >
              <Play aria-label="Start timer" className="size-4" />
            </IconButton>
          ) : null}
          {isRunning ? (
            <IconButton
              onClick={() => {
                onChange?.((current) => ({
                  ...current,
                  timer: {
                    state: 'paused',
                    remainingMs: remainingPomodoroMs(current),
                  },
                }));
              }}
            >
              <Pause aria-label="Pause timer" className="size-4" />
            </IconButton>
          ) : null}
          {isPaused ? (
            <IconButton
              className="bg-neutral-950 text-white hover:bg-neutral-800"
              onClick={() => {
                onChange?.((current) => {
                  const timer =
                    current.timer.state === 'paused'
                      ? current.timer
                      : { state: 'paused' as const, remainingMs };
                  return {
                    ...current,
                    timer: {
                      state: 'running',
                      startedAt: new Date().toISOString(),
                      durationMs: timer.remainingMs,
                    },
                  };
                });
              }}
            >
              <Play aria-label="Resume timer" className="size-4" />
            </IconButton>
          ) : null}
          {data.timer.state !== 'idle' ? (
            <IconButton
              onClick={() => {
                onChange?.((current) => ({
                  ...current,
                  timer: { state: 'idle' },
                }));
              }}
            >
              <RotateCcw aria-label="Reset timer" className="size-4" />
            </IconButton>
          ) : null}
          <IconButton
            onClick={() => {
              onChange?.((current) => ({
                ...current,
                completedSessions: current.completedSessions + 1,
                timer: { state: 'idle' },
              }));
            }}
          >
            <CheckCircle2 aria-label="Complete timer" className="size-4" />
          </IconButton>
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
  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-bold text-lg text-neutral-900">
            {title}
          </h2>
          <div className="mt-1 text-neutral-500 text-xs">
            {formatDueAt(data.snoozedUntil ?? data.dueAt)}
          </div>
        </div>
        <Bell className="size-5 shrink-0 text-neutral-400" />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-3">
        <span className="w-fit rounded-full bg-neutral-100 px-2 py-1 font-medium text-neutral-600 text-xs">
          {reminderStatusLabel(data.status)}
        </span>
        {data.note ? (
          <p className="line-clamp-4 text-neutral-700 text-sm leading-relaxed">
            {data.note}
          </p>
        ) : null}
        {readOnly ? null : (
          <div className="grid gap-2">
            <label className="grid gap-1 text-neutral-500 text-xs">
              <span>Reminder time</span>
              <input
                aria-label="Reminder time"
                className="nodrag nopan rounded-md border border-black/10 bg-white px-2 py-1.5 text-neutral-800 text-xs outline-hidden focus:border-neutral-400"
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
            </label>
            <label className="grid gap-1 text-neutral-500 text-xs">
              <span>Reminder note</span>
              <textarea
                aria-label="Reminder note"
                className="nodrag nopan min-h-12 resize-none rounded-md border border-black/10 bg-white px-2 py-1.5 text-neutral-800 text-xs outline-hidden focus:border-neutral-400"
                onChange={(event) => {
                  onChange?.((current) => ({
                    ...current,
                    note: event.target.value,
                  }));
                }}
                value={data.note ?? ''}
              />
            </label>
          </div>
        )}
      </div>
      {readOnly || data.status === 'done' ? null : (
        <div className="mt-5 flex items-center gap-2">
          <button
            className="nodrag nopan rounded-full border border-black/10 px-3 py-2 font-medium text-neutral-700 text-xs transition-colors hover:bg-neutral-50"
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
            Snooze 10 minutes
          </button>
          <button
            className="nodrag nopan rounded-full bg-neutral-950 px-3 py-2 font-medium text-white text-xs transition-colors hover:bg-neutral-800"
            onClick={(event) => {
              event.stopPropagation();
              onChange?.((current) => ({
                ...current,
                status: 'done',
              }));
            }}
            type="button"
          >
            Mark reminder done
          </button>
        </div>
      )}
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
            title={record.title}
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
            title={record.title}
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
