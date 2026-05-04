'use client';

import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function Select(props: SelectPrimitive.Root.Props<string>) {
  return <SelectPrimitive.Root {...props} />;
}

function SelectLabel({ className, ...props }: SelectPrimitive.Label.Props) {
  return (
    <SelectPrimitive.Label
      className={cn(
        'block font-medium text-neutral-600 text-xs dark:text-neutral-300',
        className
      )}
      data-slot="select-label"
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'flex h-9 w-full items-center justify-between rounded-md border border-neutral-300 bg-white px-3 text-left text-neutral-950 text-sm shadow-sm outline-none transition-colors hover:bg-neutral-50 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20 data-[popup-open]:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:hover:bg-neutral-800',
        className
      )}
      data-slot="select-trigger"
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="ml-3 flex text-neutral-500 transition-transform data-[popup-open]:rotate-180 dark:text-neutral-400">
        <ChevronDownIcon aria-hidden className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectValue(props: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

interface SelectContentProps extends SelectPrimitive.Popup.Props {
  sideOffset?: number;
}

function SelectContent({
  className,
  children,
  sideOffset = 6,
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        alignItemWithTrigger={false}
        className="z-50 outline-none"
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className={cn(
            'max-h-64 min-w-[var(--anchor-width)] origin-(--transform-origin) overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 text-neutral-950 shadow-lg outline-none transition-[transform,opacity] data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50',
            className
          )}
          data-slot="select-content"
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'grid cursor-default select-none grid-cols-[1rem_1fr] items-center gap-2 whitespace-nowrap px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-neutral-100 data-[highlighted]:text-neutral-950 data-[disabled]:opacity-50 dark:data-[highlighted]:bg-neutral-800 dark:data-[highlighted]:text-neutral-50',
        className
      )}
      data-slot="select-item"
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="flex size-4 items-center justify-center text-blue-600 dark:text-blue-400">
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
