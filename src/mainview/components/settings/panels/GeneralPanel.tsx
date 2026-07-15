import { Check } from 'lucide-react';
import { useState } from 'react';
import { LicenseActivationDialog } from '@/components/LicenseActivationDialog';
import { LicenseStatusCard } from '@/components/LicenseStatusCard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  CANVAS_BG_DARK_PRESETS,
  CANVAS_BG_LIGHT_PRESETS,
  CANVAS_BG_PRESET_ORDER,
} from '@/lib/canvasBackground';
import { cn } from '@/lib/utils';
import {
  type AppSettings,
  AUTO_SAVE_INTERVAL_OPTIONS,
  type AutoSaveIntervalSetting,
  type CanvasBackgroundSetting,
  type FontFamilySetting,
  type LocaleSetting,
  type ThemeSetting,
} from '@/settingsClient';

import type { SettingsLocaleStrings } from '../i18n/getLocaleStrings';

interface SelectOption<TValue extends string> {
  label: string;
  value: TValue;
}

type CanvasSnapOptionValue = 'off' | 'on';

const languageOptions: SelectOption<LocaleSetting>[] = [
  { label: 'English', value: 'en' },
  { label: '中文', value: 'zh' },
];

function getSelectedLabel<TValue extends string>(
  options: readonly SelectOption<TValue>[],
  value: TValue
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

interface SettingsSelectProps<TValue extends string> {
  description?: string;
  id: string;
  label: string;
  onValueChange: (value: TValue) => void;
  options: readonly SelectOption<TValue>[];
  value: TValue;
}

function SettingsSelect<TValue extends string>({
  description,
  id,
  label,
  onValueChange,
  options,
  value,
}: SettingsSelectProps<TValue>) {
  return (
    <Select
      items={options}
      onValueChange={(nextValue) => {
        if (typeof nextValue === 'string') {
          onValueChange(nextValue as TValue);
        }
      }}
      value={value}
    >
      <div className="flex flex-col gap-2">
        <div>
          <SelectLabel>
            <span
              className="font-medium text-[13px] text-neutral-800 dark:text-neutral-100"
              id={id}
            >
              {label}
            </span>
          </SelectLabel>
          {description ? (
            <p className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
              {description}
            </p>
          ) : null}
        </div>
        <SelectTrigger
          aria-labelledby={id}
          className="inline-flex h-8 w-full max-w-[240px] items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 font-medium text-[12px] text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-accent/60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
        >
          <SelectValue>{getSelectedLabel(options, value)}</SelectValue>
        </SelectTrigger>
      </div>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            label={option.label}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface GeneralPanelProps {
  errorMessage?: string | null;
  onUpdate: (patch: Partial<AppSettings>) => void;
  settings: AppSettings;
  strings: SettingsLocaleStrings;
}

export function GeneralPanel({
  errorMessage,
  onUpdate,
  settings,
  strings,
}: GeneralPanelProps) {
  const [showLicenseDialog, setShowLicenseDialog] = useState(false);

  const themeOptions: SelectOption<ThemeSetting>[] = [
    { label: strings.system, value: 'system' },
    { label: strings.light, value: 'light' },
    { label: strings.dark, value: 'dark' },
  ];
  const fontOptions: SelectOption<FontFamilySetting>[] = [
    { label: strings.fontSystem, value: 'system' },
    { label: strings.fontSerif, value: 'serif' },
    { label: strings.fontMono, value: 'mono' },
  ];
  const canvasBgLabels: Record<CanvasBackgroundSetting, string> = {
    default: strings.canvasBgDefault,
    paper: strings.canvasBgPaper,
    mono: strings.canvasBgMono,
  };
  const canvasSnapOptions: SelectOption<CanvasSnapOptionValue>[] = [
    { label: strings.canvasSnapOn, value: 'on' },
    { label: strings.canvasSnapOff, value: 'off' },
  ];
  const canvasMinimapOptions: SelectOption<CanvasSnapOptionValue>[] = [
    { label: strings.canvasMinimapOn, value: 'on' },
    { label: strings.canvasMinimapOff, value: 'off' },
  ];
  const autoSaveLabels: Record<AutoSaveIntervalSetting, string> = {
    500: strings.autoSave500,
    800: strings.autoSave800,
    2000: strings.autoSave2000,
    5000: strings.autoSave5000,
  };
  const autoSaveOptions: SelectOption<string>[] =
    AUTO_SAVE_INTERVAL_OPTIONS.map((value) => ({
      label: autoSaveLabels[value],
      value: String(value),
    }));

  return (
    <div className="space-y-5">
      <PanelHeading>{strings.generalTitle}</PanelHeading>

      {/* License Status */}
      <div className="space-y-2">
        <h3 className="font-medium text-gray-700 text-sm dark:text-gray-300">
          License
        </h3>
        <LicenseStatusCard onActivateClick={() => setShowLicenseDialog(true)} />
      </div>

      <div className="space-y-4">
        <SettingsSelect
          id="settings-language"
          label={strings.language}
          onValueChange={(locale) => {
            onUpdate({ locale });
          }}
          options={languageOptions}
          value={settings.locale}
        />
        <SettingsSelect
          id="settings-theme"
          label={strings.theme}
          onValueChange={(theme) => {
            onUpdate({ theme });
          }}
          options={themeOptions}
          value={settings.theme}
        />
        <SettingsSelect
          id="settings-font-family"
          label={strings.fontLabel}
          onValueChange={(fontFamily) => {
            onUpdate({ fontFamily });
          }}
          options={fontOptions}
          value={settings.fontFamily}
        />
        <CanvasBackgroundPicker
          id="settings-canvas-bg"
          label={strings.canvasBgLabel}
          labels={canvasBgLabels}
          onValueChange={(canvasBackground) => {
            onUpdate({ canvasBackground });
          }}
          theme={settings.theme}
          value={settings.canvasBackground}
        />
        <SettingsSelect
          id="settings-canvas-snap"
          label={strings.canvasSnapLabel}
          onValueChange={(value) => {
            onUpdate({ canvasSnapToGrid: value === 'on' });
          }}
          options={canvasSnapOptions}
          value={settings.canvasSnapToGrid ? 'on' : 'off'}
        />
        <SettingsSelect
          id="settings-canvas-minimap"
          label={strings.canvasMinimapLabel}
          onValueChange={(value) => {
            onUpdate({ canvasShowMinimap: value === 'on' });
          }}
          options={canvasMinimapOptions}
          value={settings.canvasShowMinimap ? 'on' : 'off'}
        />
        <SettingsSelect
          id="settings-auto-save"
          label={strings.autoSaveLabel}
          onValueChange={(value) => {
            const parsed = Number.parseInt(
              value,
              10
            ) as AutoSaveIntervalSetting;
            if (AUTO_SAVE_INTERVAL_OPTIONS.includes(parsed)) {
              onUpdate({ autoSaveInterval: parsed });
            }
          }}
          options={autoSaveOptions}
          value={String(settings.autoSaveInterval)}
        />

        {errorMessage ? (
          <p className="text-red-600 text-sm dark:text-red-400" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>

      {/* License Activation Dialog */}
      <LicenseActivationDialog
        onClose={() => setShowLicenseDialog(false)}
        onSuccess={() => {
          // 刷新许可证状态
          window.location.reload();
        }}
        open={showLicenseDialog}
      />
    </div>
  );
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-semibold text-[15px] text-neutral-900 dark:text-neutral-50">
      {children}
    </h2>
  );
}

function isDarkThemeSetting(theme: ThemeSetting): boolean {
  if (theme === 'dark') {
    return true;
  }
  if (theme === 'light') {
    return false;
  }
  return globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
}

interface CanvasBackgroundPickerProps {
  id: string;
  label: string;
  labels: Record<CanvasBackgroundSetting, string>;
  onValueChange: (value: CanvasBackgroundSetting) => void;
  theme: ThemeSetting;
  value: CanvasBackgroundSetting;
}

function CanvasBackgroundPicker({
  id,
  label,
  labels,
  onValueChange,
  theme,
  value,
}: CanvasBackgroundPickerProps) {
  const isDark = isDarkThemeSetting(theme);
  const lightPresets = CANVAS_BG_LIGHT_PRESETS;
  const darkPresets = CANVAS_BG_DARK_PRESETS;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <span
          className="block font-medium text-[13px] text-neutral-800 dark:text-neutral-100"
          id={id}
        >
          {label}
        </span>
      </div>
      <div
        aria-labelledby={id}
        className="grid max-w-[360px] grid-cols-3 gap-2"
        role="radiogroup"
      >
        {CANVAS_BG_PRESET_ORDER.map((preset) => {
          const selected = value === preset;
          const lightColor = lightPresets[preset];
          const darkColor = darkPresets[preset];
          const previewColor = isDark ? darkColor : lightColor;
          const inputId = `${id}-${preset}`;

          return (
            <label
              className={cn(
                'group flex cursor-pointer flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors',
                'has-focus-visible:outline-2 has-focus-visible:outline-accent/60 has-focus-visible:outline-offset-2',
                selected
                  ? 'border-accent bg-accent/5 shadow-sm dark:bg-accent/10'
                  : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-800'
              )}
              htmlFor={inputId}
              key={preset}
            >
              <input
                checked={selected}
                className="sr-only"
                id={inputId}
                name={id}
                onChange={() => {
                  onValueChange(preset);
                }}
                type="radio"
                value={preset}
              />
              <span
                className={cn(
                  'relative flex h-12 w-full items-end justify-end overflow-hidden rounded-md border',
                  isDark
                    ? 'border-white/10'
                    : 'border-black/8 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.02)]'
                )}
                style={{ backgroundColor: previewColor }}
              >
                {selected ? (
                  <span className="m-1 flex size-4 items-center justify-center rounded-full bg-accent text-white shadow-sm">
                    <Check aria-hidden className="size-2.5" strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              <span className="px-0.5 font-medium text-[11px] text-neutral-700 leading-tight dark:text-neutral-200">
                {labels[preset]}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
