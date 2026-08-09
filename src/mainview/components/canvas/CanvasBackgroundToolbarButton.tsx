import { Popover } from '@base-ui/react/popover';
import { useTheme } from 'better-themes';
import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ColorPicker } from '@/components/ui/ColorPicker';
import {
  CANVAS_BG_PRESET_ORDER,
  type CanvasBackgroundPreset,
  resolveCanvasBackground,
} from '@/lib/canvasBackground';
import {
  addCanvasBackgroundCustom,
  loadCanvasBackgroundCustoms,
  removeCanvasBackgroundCustom,
  saveCanvasBackgroundCustoms,
} from '@/lib/canvasBackgroundCustoms';
import { persistAppSettingsPatch } from '@/lib/persistAppSettings';
import { cn } from '@/lib/utils';
import { useAppSettingsStore } from '@/store/appSettingsStore';

import * as m from '../../../paraglide/messages.js';

function useIsDarkTheme(): boolean {
  const { theme, systemTheme } = useTheme();
  return theme === 'dark' || (theme === 'system' && systemTheme === 'dark');
}

function isSwatchSelected(
  swatch: string,
  current: string,
  isDark: boolean
): boolean {
  if (current === swatch) {
    return true;
  }
  return (
    resolveCanvasBackground(current, isDark).toLowerCase() ===
    resolveCanvasBackground(swatch, isDark).toLowerCase()
  );
}

/**
 * Bottom-left toolbar control: opens a quick canvas-background palette
 * (built-in presets + custom swatches + pipette color picker).
 */
export function CanvasBackgroundToolbarButton() {
  const canvasBackground = useAppSettingsStore((s) => s.canvasBackground);
  const isDark = useIsDarkTheme();
  const resolved = resolveCanvasBackground(canvasBackground, isDark);
  const [open, setOpen] = useState(false);
  const [customs, setCustoms] = useState<string[]>([]);
  const [pickerValue, setPickerValue] = useState(resolved);

  useEffect(() => {
    setCustoms(loadCanvasBackgroundCustoms());
  }, []);

  useEffect(() => {
    setPickerValue(resolved);
  }, [resolved]);

  const selectBackground = (value: string) => {
    persistAppSettingsPatch({ canvasBackground: value }).catch(() => undefined);
  };

  const handlePickerChange = (value: string) => {
    setPickerValue(value);
    selectBackground(value);
  };

  const handleAddCustom = (value: string) => {
    setCustoms((prev) => {
      const next = addCanvasBackgroundCustom(prev, value);
      saveCanvasBackgroundCustoms(next);
      return next;
    });
    selectBackground(value);
  };

  const handleRemoveCustom = (color: string) => {
    setCustoms((prev) => {
      const next = removeCanvasBackgroundCustom(prev, color);
      saveCanvasBackgroundCustoms(next);
      return next;
    });
    if (canvasBackground.toLowerCase() === color.toLowerCase()) {
      selectBackground('default');
    }
  };

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger
        aria-label={m.canvas_bg_button_aria()}
        className="relative flex size-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-black/5 hover:text-neutral-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
        title={m.canvas_bg_button_aria()}
      >
        <span
          aria-hidden
          className="relative inline-flex size-4 items-center justify-center rounded-full border border-black/15 shadow-inner dark:border-white/20"
          style={{ backgroundColor: resolved }}
        />
      </Popover.Trigger>
      <Popover.Portal>
        {/* Open to the right of the toolbar instead of upward: the trigger sits
            in the middle of a vertical pill, so an upward popover would cover
            the buttons stacked above it. Right/bottom-aligned end stays clear
            of every sibling and within the lower-left canvas region. */}
        <Popover.Positioner align="end" side="right" sideOffset={10}>
          <Popover.Popup className="z-50 w-[23rem] origin-(--transform-origin) rounded-3xl border border-black/5 bg-white/90 p-4 shadow-xl outline-hidden backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/95 dark:text-neutral-100">
            <div className="mb-3 text-center">
              <Popover.Title className="font-medium text-lg">
                {m.canvas_bg_picker_title()}
              </Popover.Title>
              <Popover.Description className="mt-0.5 text-neutral-500 text-sm dark:text-neutral-400">
                {m.canvas_bg_picker_description()}
              </Popover.Description>
            </div>

            <div className="grid grid-cols-5 place-items-center gap-2">
              <ColorPicker
                addLabel={m.canvas_bg_add_color()}
                handleAdd={handleAddCustom}
                onChange={handlePickerChange}
                title={m.canvas_bg_color_picker_title()}
                value={pickerValue}
              />

              {CANVAS_BG_PRESET_ORDER.map((preset) => (
                <BackgroundSwatch
                  color={resolveCanvasBackground(preset, isDark)}
                  key={preset}
                  label={presetLabel(preset)}
                  onSelect={() => {
                    selectBackground(preset);
                  }}
                  selected={isSwatchSelected(preset, canvasBackground, isDark)}
                />
              ))}

              {customs.map((color) => (
                <BackgroundSwatch
                  color={color}
                  key={color}
                  label={color}
                  onRemove={() => {
                    handleRemoveCustom(color);
                  }}
                  onSelect={() => {
                    selectBackground(color);
                  }}
                  removeLabel={m.canvas_bg_remove_color()}
                  selected={isSwatchSelected(color, canvasBackground, isDark)}
                />
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function presetLabel(preset: CanvasBackgroundPreset): string {
  switch (preset) {
    case 'default':
      return m.settings_canvas_bg_default();
    case 'paper':
      return m.settings_canvas_bg_paper();
    case 'cream':
      return m.settings_canvas_bg_cream();
    case 'mono':
      return m.settings_canvas_bg_mono();
    case 'lavender':
      return m.settings_canvas_bg_lavender();
    case 'sage':
      return m.settings_canvas_bg_sage();
    case 'mist':
      return m.settings_canvas_bg_mist();
    case 'sand':
      return m.settings_canvas_bg_sand();
    case 'ivory':
      return m.settings_canvas_bg_ivory();
    case 'mint':
      return m.settings_canvas_bg_mint();
    case 'lichen':
      return m.settings_canvas_bg_lichen();
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

function BackgroundSwatch({
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
            'relative flex size-8 items-center justify-center rounded-full border border-black/10 dark:border-white/15'
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
