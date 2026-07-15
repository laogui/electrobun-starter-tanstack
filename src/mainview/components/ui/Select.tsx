'use client';

import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { createContext, type ReactNode, use, useId } from 'react';

import { cn } from '@/lib/utils';

const SelectContext = createContext<string | null>(null);

interface SelectProps {
  children: ReactNode;
  items: SelectPrimitive.Root.Props<string>['items'];
  onValueChange: SelectPrimitive.Root.Props<string>['onValueChange'];
  value: SelectPrimitive.Root.Props<string>['value'];
}

function Select({ children, items, onValueChange, value }: SelectProps) {
  const labelId = useId();

  return (
    <SelectContext value={labelId}>
      <SelectPrimitive.Root
        items={items}
        onValueChange={onValueChange}
        value={value}
      >
        {children}
      </SelectPrimitive.Root>
    </SelectContext>
  );
}

interface SelectLabelProps {
  children: ReactNode;
  className?: string;
}

function SelectLabel({ children, className }: SelectLabelProps) {
  const labelId = use(SelectContext);

  return (
    <div
      className={cn(
        'block font-medium text-neutral-600 text-xs dark:text-neutral-300',
        className
      )}
      data-slot="select-label"
      id={labelId ?? undefined}
    >
      {children}
    </div>
  );
}

interface SelectTriggerProps {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  children: ReactNode;
  className?: string;
  id?: string;
}

function SelectTrigger({
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className,
  children,
  id,
}: SelectTriggerProps) {
  const contextLabelId = use(SelectContext);
  const labelId =
    ariaLabelledBy ?? (ariaLabel ? undefined : (contextLabelId ?? undefined));

  return (
    <SelectPrimitive.Trigger
      aria-label={ariaLabel}
      aria-labelledby={labelId}
      className={cn(
        'flex h-9 w-full items-center justify-between rounded-md border border-neutral-300 bg-white px-3 text-left text-neutral-950 text-sm shadow-sm outline-hidden transition-colors hover:bg-neutral-50 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 data-[popup-open]:border-accent dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:hover:bg-neutral-800',
        className
      )}
      data-slot="select-trigger"
      id={id}
    >
      {children}
      <SelectPrimitive.Icon className="ml-3 flex text-neutral-500 transition-transform data-[popup-open]:rotate-180 dark:text-neutral-400">
        <ChevronDownIcon aria-hidden className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

interface SelectValueProps {
  children: ReactNode;
}

function SelectValue({ children }: SelectValueProps) {
  return (
    <SelectPrimitive.Value data-slot="select-value">
      {children}
    </SelectPrimitive.Value>
  );
}

interface SelectContentProps {
  children: ReactNode;
  className?: string;
  sideOffset?: number;
}

function SelectContent({
  className,
  children,
  sideOffset = 6,
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        alignItemWithTrigger={false}
        // Above SettingsDialog (z-55) and nested confirm dialogs (z-60) so
        // the popup stays clickable when Select is used inside a modal.
        className="z-[70] outline-hidden"
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className={cn(
            'max-h-64 min-w-[var(--anchor-width)] origin-(--transform-origin) overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 text-neutral-950 shadow-lg outline-hidden transition-[transform,opacity] data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50',
            className
          )}
          data-slot="select-content"
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

interface SelectItemProps {
  children: ReactNode;
  className?: string;
  label: string;
  value: string;
}

function SelectItem({ className, children, label, value }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'grid cursor-default select-none grid-cols-[1rem_1fr] items-center gap-2 whitespace-nowrap px-2.5 py-2 text-sm outline-hidden data-[highlighted]:bg-neutral-100 data-[highlighted]:text-neutral-950 data-[disabled]:opacity-50 dark:data-[highlighted]:bg-neutral-800 dark:data-[highlighted]:text-neutral-50',
        className
      )}
      data-slot="select-item"
      label={label}
      value={value}
    >
      <SelectPrimitive.ItemIndicator className="flex size-4 items-center justify-center text-accent">
        <CheckIcon aria-hidden className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
};
