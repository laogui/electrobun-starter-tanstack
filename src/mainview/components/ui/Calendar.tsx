'use client';

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react';
import { type ComponentProps, type Ref, useEffect, useRef } from 'react';
import {
  type DayButton,
  DayPicker,
  getDefaultClassNames,
} from 'react-day-picker';
import { cn } from '@/lib/utils';

const NAV_BUTTON_CLASS =
  'inline-flex size-(--cell-size) select-none items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 aria-disabled:pointer-events-none aria-disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white';

function CalendarRoot({
  className,
  rootRef,
  ...props
}: ComponentProps<'div'> & { rootRef?: Ref<HTMLDivElement> }) {
  return (
    <div
      className={cn(className)}
      data-slot="calendar"
      ref={rootRef}
      {...props}
    />
  );
}

function CalendarChevron({
  className,
  orientation,
  ...props
}: {
  className?: string;
  disabled?: boolean;
  orientation?: 'down' | 'left' | 'right' | 'up';
  size?: number;
  style?: ComponentProps<'svg'>['style'];
}) {
  if (orientation === 'left') {
    return <ChevronLeftIcon className={cn('size-4', className)} {...props} />;
  }
  if (orientation === 'right') {
    return <ChevronRightIcon className={cn('size-4', className)} {...props} />;
  }
  return <ChevronDownIcon className={cn('size-4', className)} {...props} />;
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  formatters,
  components,
  ...props
}: ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      captionLayout={captionLayout}
      className={cn(
        'group/calendar p-3 [--cell-size:2rem]',
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn(
          'relative flex flex-col gap-4 md:flex-row',
          defaultClassNames.months
        ),
        month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
        nav: cn(
          'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
          defaultClassNames.nav
        ),
        button_previous: cn(
          NAV_BUTTON_CLASS,
          defaultClassNames.button_previous
        ),
        button_next: cn(NAV_BUTTON_CLASS, defaultClassNames.button_next),
        month_caption: cn(
          'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          'flex h-(--cell-size) w-full items-center justify-center gap-1.5 font-medium text-sm',
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          'relative rounded-md border border-neutral-200 shadow-xs has-focus:border-accent has-focus:ring-2 has-focus:ring-accent/20 dark:border-neutral-700',
          defaultClassNames.dropdown_root
        ),
        dropdown: cn('absolute inset-0 opacity-0', defaultClassNames.dropdown),
        caption_label: cn(
          'select-none font-medium',
          captionLayout === 'label'
            ? 'text-sm'
            : 'flex h-8 items-center gap-1 rounded-md pr-1 pl-2 text-sm [&>svg]:size-3.5 [&>svg]:text-neutral-400',
          defaultClassNames.caption_label
        ),
        month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'flex-1 select-none rounded-md font-normal text-[0.8rem] text-neutral-400 dark:text-neutral-500',
          defaultClassNames.weekday
        ),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        week_number_header: cn(
          'w-(--cell-size) select-none',
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          'select-none text-[0.8rem] text-neutral-400',
          defaultClassNames.week_number
        ),
        day: cn(
          'group/day relative aspect-square h-full w-full select-none p-0 text-center',
          defaultClassNames.day
        ),
        range_start: cn(
          'rounded-l-md bg-accent-softer',
          defaultClassNames.range_start
        ),
        range_middle: cn('rounded-none', defaultClassNames.range_middle),
        range_end: cn(
          'rounded-r-md bg-accent-softer',
          defaultClassNames.range_end
        ),
        today: cn(
          'rounded-md bg-accent-softer text-accent-strong',
          defaultClassNames.today
        ),
        outside: cn(
          'text-neutral-400 aria-selected:text-neutral-400 dark:text-neutral-600',
          defaultClassNames.outside
        ),
        disabled: cn('text-neutral-400 opacity-50', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: CalendarRoot,
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
        ...components,
      }}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString('default', { month: 'short' }),
        ...formatters,
      }}
      showOutsideDays={showOutsideDays}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (modifiers.focused) {
      ref.current?.focus();
    }
  }, [modifiers.focused]);

  return (
    <button
      className={cn(
        'flex aspect-square size-auto w-full min-w-(--cell-size) flex-col items-center justify-center gap-1 rounded-md font-normal text-sm leading-none',
        'hover:bg-neutral-100 dark:hover:bg-white/10',
        'group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-2 group-data-[focused=true]/day:ring-accent/40',
        'data-[selected-single=true]:bg-accent data-[selected-single=true]:text-accent-foreground data-[selected-single=true]:hover:bg-accent',
        'data-[range-start=true]:rounded-l-md data-[range-start=true]:bg-accent data-[range-start=true]:text-accent-foreground',
        'data-[range-end=true]:rounded-r-md data-[range-end=true]:bg-accent data-[range-end=true]:text-accent-foreground',
        'data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent-softer data-[range-middle=true]:text-accent-strong',
        'data-[selected-single=true]:data-[today=true]:bg-accent data-[selected-single=true]:data-[today=true]:text-accent-foreground data-[today=true]:bg-accent-softer data-[today=true]:text-accent-strong',
        defaultClassNames.day,
        className
      )}
      data-day={day.isoDate}
      data-range-end={modifiers.range_end || undefined}
      data-range-middle={modifiers.range_middle || undefined}
      data-range-start={modifiers.range_start || undefined}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
          ? true
          : undefined
      }
      data-today={modifiers.today || undefined}
      ref={ref}
      type="button"
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
