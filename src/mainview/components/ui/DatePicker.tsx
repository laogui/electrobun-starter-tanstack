'use client';

import { Popover } from '@base-ui/react/popover';
import { format } from 'date-fns';
import { CalendarDays, ChevronDownIcon, Clock3 } from 'lucide-react';
import {
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { enUS, zhCN } from 'react-day-picker/locale';

import {
  addDays,
  applyCalendarDay,
  applyTimeOfDay,
  calendarMonthBounds,
  formatTimeInput,
} from '@/lib/dateTime';
import { cn } from '@/lib/utils';
import { useAppSettingsStore } from '@/store/appSettingsStore';

import { Calendar } from './Calendar';

export interface DatePickerLabels {
  placeholder?: string;
  time?: string;
  today?: string;
  tomorrow?: string;
}

export interface DatePickerProps {
  'aria-label'?: string;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  includeTime?: boolean;
  labels?: DatePickerLabels;
  onChange: (next: Date | undefined) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  placeholder?: string;
  triggerClassName?: string;
  value?: Date;
}

const DEFAULT_LABELS = {
  placeholder: 'Pick a date',
  time: 'Time',
  today: 'Today',
  tomorrow: 'Tomorrow',
} satisfies Required<DatePickerLabels>;

function stopPopoverEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

export function DatePicker({
  'aria-label': ariaLabel,
  children,
  className,
  disabled = false,
  includeTime = false,
  labels,
  onChange,
  onOpenChange,
  open,
  placeholder,
  triggerClassName,
  value,
}: DatePickerProps) {
  const locale = useAppSettingsStore((state) => state.locale);
  const dayPickerLocale = locale === 'zh' ? zhCN : enUS;
  const resolvedLabels = {
    ...DEFAULT_LABELS,
    ...labels,
    ...(placeholder ? { placeholder } : {}),
  };
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const [month, setMonth] = useState<Date>(value ?? new Date());
  const monthBounds = useMemo(() => calendarMonthBounds(), []);
  const valueTime = value?.getTime();

  useEffect(() => {
    if (valueTime === undefined) {
      return;
    }
    setMonth((current) =>
      current.getTime() === valueTime ? current : new Date(valueTime)
    );
  }, [valueTime]);

  const setIsOpen = (next: boolean) => {
    if (open === undefined) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  };

  const commitDate = (next: Date, closeWhenDateOnly = true) => {
    onChange(next);
    if (closeWhenDateOnly && !includeTime) {
      setIsOpen(false);
    }
  };

  const formattedValue = value
    ? format(value, includeTime ? 'PPp' : 'PP', { locale: dayPickerLocale })
    : resolvedLabels.placeholder;

  return (
    <Popover.Root onOpenChange={setIsOpen} open={isOpen}>
      <Popover.Trigger
        aria-label={ariaLabel}
        className={cn(
          'nodrag nopan outline-hidden disabled:pointer-events-none disabled:opacity-50',
          children
            ? 'w-full rounded-2xl text-left focus-visible:ring-2 focus-visible:ring-accent/30'
            : 'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-neutral-300 bg-white px-3 text-left text-neutral-950 text-sm shadow-sm hover:bg-neutral-50 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:hover:bg-neutral-800',
          triggerClassName
        )}
        data-slot="date-picker-trigger"
        disabled={disabled}
        type="button"
      >
        {children ?? (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <CalendarDays
                aria-hidden
                className="size-4 shrink-0 text-neutral-400 dark:text-neutral-500"
              />
              <span
                className={cn(
                  'truncate',
                  !value && 'text-neutral-400 dark:text-neutral-500'
                )}
              >
                {formattedValue}
              </span>
            </span>
            <ChevronDownIcon
              aria-hidden
              className="size-4 shrink-0 text-neutral-400"
            />
          </>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="start" className="z-[80]" sideOffset={8}>
          <Popover.Popup
            className={cn(
              'nodrag nopan nowheel origin-(--transform-origin) overflow-hidden rounded-xl border border-black/5 bg-white text-neutral-950 shadow-xl outline-hidden dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-50',
              className
            )}
            data-slot="date-picker-content"
            onClick={stopPopoverEvent}
            onContextMenu={stopPopoverEvent}
            onDoubleClick={stopPopoverEvent}
            onMouseDown={stopPopoverEvent}
            onPointerDown={stopPopoverEvent}
            onWheel={stopPopoverEvent}
          >
            <Calendar
              captionLayout="dropdown"
              defaultMonth={value}
              disabled={disabled}
              endMonth={monthBounds.endMonth}
              locale={dayPickerLocale}
              mode="single"
              month={month}
              onMonthChange={setMonth}
              onSelect={(next) => {
                if (!next) {
                  return;
                }
                commitDate(applyCalendarDay(value, next));
              }}
              selected={value}
              startMonth={monthBounds.startMonth}
            />
            <div className="flex flex-col gap-2 border-neutral-100 border-t px-3 py-3 dark:border-white/10">
              {includeTime ? (
                <label className="flex items-center gap-2">
                  <Clock3
                    aria-hidden
                    className="size-3.5 shrink-0 text-neutral-400"
                  />
                  <span className="sr-only">{resolvedLabels.time}</span>
                  <input
                    aria-label={resolvedLabels.time}
                    className="nodrag nopan h-8 min-w-0 flex-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 font-medium text-sm tabular-nums outline-hidden transition-colors focus-visible:border-accent focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-accent/20 dark:border-neutral-700 dark:bg-white/5 dark:focus-visible:border-accent dark:focus-visible:bg-neutral-900 [&::-webkit-calendar-picker-indicator]:hidden"
                    onChange={(event) => {
                      const next = applyTimeOfDay(value, event.target.value);
                      if (next) {
                        onChange(next);
                      }
                    }}
                    step={60}
                    type="time"
                    value={value ? formatTimeInput(value) : ''}
                  />
                </label>
              ) : null}
              <div className="flex gap-2">
                <button
                  className="nodrag nopan inline-flex h-8 flex-1 items-center justify-center rounded-md bg-neutral-100 px-2 font-medium text-neutral-700 text-xs transition-colors hover:bg-neutral-200/80 dark:bg-white/8 dark:text-white/80 dark:hover:bg-white/12"
                  onClick={() => {
                    commitDate(applyCalendarDay(value, new Date()));
                  }}
                  type="button"
                >
                  {resolvedLabels.today}
                </button>
                <button
                  className="nodrag nopan inline-flex h-8 flex-1 items-center justify-center rounded-md bg-neutral-100 px-2 font-medium text-neutral-700 text-xs transition-colors hover:bg-neutral-200/80 dark:bg-white/8 dark:text-white/80 dark:hover:bg-white/12"
                  onClick={() => {
                    commitDate(applyCalendarDay(value, addDays(new Date(), 1)));
                  }}
                  type="button"
                >
                  {resolvedLabels.tomorrow}
                </button>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
