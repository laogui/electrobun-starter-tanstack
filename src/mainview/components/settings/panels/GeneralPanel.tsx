import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  type AppSettings,
  AUTO_SAVE_INTERVAL_OPTIONS,
  type AutoSaveIntervalSetting,
  type CanvasBackgroundSetting,
  type FontFamilySetting,
  type LocaleSetting,
  type ThemeSetting,
} from '@/settingsClient';

import type { SettingsLocaleStrings } from '../strings';

interface SelectOption<TValue extends string> {
  label: string;
  value: TValue;
}

type CanvasSnapOptionValue = 'off' | 'on';

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
          className="inline-flex h-8 w-full max-w-[240px] items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 font-medium text-[12px] text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-blue-500/60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
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
  const themeOptions: SelectOption<ThemeSetting>[] = [
    { label: strings.system, value: 'system' },
    { label: strings.light, value: 'light' },
    { label: strings.dark, value: 'dark' },
  ];
  const languageOptions: SelectOption<LocaleSetting>[] = [
    { label: 'English', value: 'en' },
    { label: '中文', value: 'zh' },
  ];
  const fontOptions: SelectOption<FontFamilySetting>[] = [
    { label: strings.fontSystem, value: 'system' },
    { label: strings.fontSerif, value: 'serif' },
    { label: strings.fontMono, value: 'mono' },
  ];
  const canvasBgOptions: SelectOption<CanvasBackgroundSetting>[] = [
    { label: strings.canvasBgDefault, value: 'default' },
    { label: strings.canvasBgPaper, value: 'paper' },
    { label: strings.canvasBgMono, value: 'mono' },
  ];
  const canvasSnapOptions: SelectOption<CanvasSnapOptionValue>[] = [
    { label: strings.canvasSnapOn, value: 'on' },
    { label: strings.canvasSnapOff, value: 'off' },
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
        <SettingsSelect
          id="settings-canvas-bg"
          label={strings.canvasBgLabel}
          onValueChange={(canvasBackground) => {
            onUpdate({ canvasBackground });
          }}
          options={canvasBgOptions}
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
