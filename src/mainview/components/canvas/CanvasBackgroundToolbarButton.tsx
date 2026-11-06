import { Popover } from '@base-ui/react/popover';
import { useTheme } from 'better-themes';
import { useEffect, useState } from 'react';

import { ColorSwatchPanel } from '@/components/ui/ColorSwatchPanel';
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
        className="relative flex size-8 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-black/5 hover:text-neutral-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
        title={m.canvas_bg_button_aria()}
      >
        <span
          aria-hidden
          className="relative inline-flex size-3.5 items-center justify-center rounded-full border border-black/15 shadow-inner dark:border-white/20"
          style={{ backgroundColor: resolved }}
        />
      </Popover.Trigger>
      <Popover.Portal>
        {/* Open to the right of the toolbar instead of upward: the trigger sits
            in the middle of a vertical pill, so an upward popover would cover
            the buttons stacked above it. Right/bottom-aligned end stays clear
            of every sibling and within the lower-left canvas region. */}
        <Popover.Positioner align="end" side="right" sideOffset={10}>
          <Popover.Popup className="floating-menu-popup z-50 w-[17.5rem] rounded-2xl border border-black/5 bg-white/95 p-3.5 shadow-xl outline-hidden backdrop-blur-xl dark:border-white/10 dark:bg-neutral-800/95 dark:text-neutral-100">
            <div className="mb-3 px-0.5">
              <Popover.Title className="font-semibold text-[13px] text-gray-900 dark:text-gray-100">
                {m.canvas_bg_picker_title()}
              </Popover.Title>
              <Popover.Description className="mt-0.5 text-gray-500 text-xs dark:text-gray-400">
                {m.canvas_bg_picker_description()}
              </Popover.Description>
            </div>

            <ColorSwatchPanel
              addLabel={m.canvas_bg_add_color()}
              customs={customs}
              isSelected={(value) =>
                isSwatchSelected(value, canvasBackground, isDark)
              }
              onAddCustom={handleAddCustom}
              onPickerChange={handlePickerChange}
              onRemoveCustom={handleRemoveCustom}
              onSelect={selectBackground}
              pickerTitle={m.canvas_bg_color_picker_title()}
              pickerValue={pickerValue}
              presets={CANVAS_BG_PRESET_ORDER.map((preset) => ({
                color: resolveCanvasBackground(preset, isDark),
                label: presetLabel(preset),
                value: preset,
              }))}
              removeLabel={m.canvas_bg_remove_color()}
            />
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
