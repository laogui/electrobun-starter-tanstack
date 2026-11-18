import { Check, X } from 'lucide-react';

import { ColorPicker } from '@/components/ui/ColorPicker';
import { cn } from '@/lib/utils';

export interface ColorSwatchOption {
  /** Colour painted on the swatch. */
  color: string;
  label: string;
  /** Value passed to `onSelect`; defaults to `color` (presets use a name). */
  value?: string;
}

/**
 * The palette shared by every colour choice on the canvas (canvas background,
 * card colour): a custom picker, the built-in swatches, then the user's own
 * saved swatches. Callers own what a value means and where it is stored.
 */
export function ColorSwatchPanel({
  addLabel,
  customs,
  isSelected,
  onAddCustom,
  onPickerChange,
  onRemoveCustom,
  onSelect,
  pickerTitle,
  pickerValue,
  presets,
  removeLabel,
}: {
  addLabel: string;
  customs: readonly string[];
  isSelected: (value: string) => boolean;
  onAddCustom: (value: string) => void;
  onPickerChange: (value: string) => void;
  onRemoveCustom: (value: string) => void;
  onSelect: (value: string) => void;
  pickerTitle: string;
  pickerValue: string;
  presets: readonly ColorSwatchOption[];
  removeLabel: string;
}) {
  return (
    <div className="grid grid-cols-5 place-items-center gap-2">
      <ColorPicker
        addLabel={addLabel}
        handleAdd={onAddCustom}
        onChange={onPickerChange}
        title={pickerTitle}
        value={pickerValue}
      />

      {presets.map((preset) => {
        const value = preset.value ?? preset.color;
        return (
          <ColorSwatch
            color={preset.color}
            key={value}
            label={preset.label}
            onSelect={() => {
              onSelect(value);
            }}
            selected={isSelected(value)}
          />
        );
      })}

      {customs.map((color) => (
        <ColorSwatch
          color={color}
          key={color}
          label={color}
          onRemove={() => {
            onRemoveCustom(color);
          }}
          onSelect={() => {
            onSelect(color);
          }}
          removeLabel={removeLabel}
          selected={isSelected(color)}
        />
      ))}
    </div>
  );
}

export function ColorSwatch({
  color,
  label,
  onRemove,
  onSelect,
  removeLabel,
  selected,
}: {
  color: string;
  label: string;
  onRemove?: () => void;
  onSelect: () => void;
  removeLabel?: string;
  selected: boolean;
}) {
  return (
    <div className="group relative flex aspect-square size-fit items-center justify-center">
      <button
        aria-label={label}
        className="flex aspect-square size-fit items-center justify-center rounded-full bg-white/10 p-0.5 outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60"
        onClick={onSelect}
        title={label}
        type="button"
      >
        <span
          className={cn(
            'relative flex size-8 items-center justify-center rounded-full border border-black/10 transition-shadow dark:border-white/15',
            selected &&
              'ring-2 ring-accent ring-offset-2 ring-offset-white dark:ring-offset-neutral-800'
          )}
          style={{ backgroundColor: color }}
        >
          {selected ? (
            <Check
              aria-hidden
              className="size-4 text-neutral-800 drop-shadow-sm dark:text-white"
              strokeWidth={2.5}
            />
          ) : null}
        </span>
      </button>
      {onRemove && removeLabel ? (
        <button
          aria-label={removeLabel}
          className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-neutral-800 text-white opacity-0 shadow-sm transition-opacity hover:bg-neutral-700 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent/60 group-hover:opacity-100 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          title={removeLabel}
          type="button"
        >
          <X aria-hidden className="size-2.5" strokeWidth={3} />
        </button>
      ) : null}
    </div>
  );
}
