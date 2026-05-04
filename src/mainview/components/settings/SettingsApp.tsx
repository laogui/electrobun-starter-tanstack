import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  DEFAULT_SETTINGS,
  type DefaultLayoutMode,
  type LocaleSetting,
  type SettingsClient,
  type ThemeSetting,
} from '@/settingsClient';

const THEME_VALUES: readonly ThemeSetting[] = ['system', 'light', 'dark'];
const LOCALE_VALUES: readonly LocaleSetting[] = ['en', 'zh'];
const LAYOUT_VALUES: readonly DefaultLayoutMode[] = ['canvas', 'document'];

interface SelectOption<TValue extends string> {
  label: string;
  value: TValue;
}

const localeStrings: Record<
  LocaleSetting,
  {
    canvas: string;
    dark: string;
    defaultLayout: string;
    document: string;
    language: string;
    light: string;
    loadError: string;
    system: string;
    theme: string;
    title: string;
    saveError: string;
  }
> = {
  en: {
    title: 'Settings',
    language: 'Language',
    theme: 'Theme',
    defaultLayout: 'Default Layout',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    canvas: 'Canvas',
    document: 'Document',
    loadError: 'Unable to load settings.',
    saveError: 'Unable to save settings.',
  },
  zh: {
    title: '设置',
    language: '语言',
    theme: '主题',
    defaultLayout: '默认布局',
    system: '跟随系统',
    light: '浅色',
    dark: '深色',
    canvas: '画布',
    document: '文档',
    loadError: '无法加载设置。',
    saveError: '无法保存设置。',
  },
};

function includesValue<TValue extends string>(
  values: readonly TValue[],
  value: unknown
): value is TValue {
  return typeof value === 'string' && values.includes(value as TValue);
}

export function normalizeSettings(
  settings: Partial<AppSettings> | null | undefined
): AppSettings {
  return {
    theme: includesValue(THEME_VALUES, settings?.theme)
      ? settings.theme
      : DEFAULT_SETTINGS.theme,
    locale: includesValue(LOCALE_VALUES, settings?.locale)
      ? settings.locale
      : DEFAULT_SETTINGS.locale,
    defaultLayoutMode: includesValue(LAYOUT_VALUES, settings?.defaultLayoutMode)
      ? settings.defaultLayoutMode
      : DEFAULT_SETTINGS.defaultLayoutMode,
  };
}

export function applyTheme(theme: ThemeSetting) {
  const html = document.documentElement;

  if (theme === 'dark') {
    html.classList.add('dark');
    return;
  }

  if (theme === 'light') {
    html.classList.remove('dark');
    return;
  }

  html.classList.toggle(
    'dark',
    globalThis.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function getSelectedLabel<TValue extends string>(
  options: readonly SelectOption<TValue>[],
  value: TValue
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

interface SettingsAppProps {
  client: SettingsClient;
}

interface SettingsSelectProps<TValue extends string> {
  id: string;
  label: string;
  onValueChange: (value: TValue) => void;
  options: readonly SelectOption<TValue>[];
  value: TValue;
}

function SettingsSelect<TValue extends string>({
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
      <div className="space-y-1.5">
        <SelectLabel>{label}</SelectLabel>
        <SelectTrigger
          className="max-w-72 [-webkit-app-region:no-drag]"
          id={id}
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

function SettingsApp({ client }: SettingsAppProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const settingsRef = useRef(settings);

  const strings = localeStrings[settings.locale];

  const languageOptions = useMemo(
    () =>
      [
        { label: 'English', value: 'en' },
        { label: '中文', value: 'zh' },
      ] satisfies SelectOption<LocaleSetting>[],
    []
  );

  const themeOptions = useMemo(
    () =>
      [
        { label: strings.system, value: 'system' },
        { label: strings.light, value: 'light' },
        { label: strings.dark, value: 'dark' },
      ] satisfies SelectOption<ThemeSetting>[],
    [strings]
  );

  const layoutOptions = useMemo(
    () =>
      [
        { label: strings.canvas, value: 'canvas' },
        { label: strings.document, value: 'document' },
      ] satisfies SelectOption<DefaultLayoutMode>[],
    [strings]
  );

  useEffect(() => {
    let mounted = true;

    client
      .getSettings()
      .then((loadedSettings) => {
        if (!mounted) {
          return;
        }
        const normalizedSettings = normalizeSettings(loadedSettings);
        settingsRef.current = normalizedSettings;
        setSettings(normalizedSettings);
        setLoadFailed(false);
      })
      .catch(() => {
        if (mounted) {
          setLoadFailed(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [client]);

  useEffect(() => {
    settingsRef.current = settings;
    applyTheme(settings.theme);
    document.documentElement.lang = settings.locale;
    document.title = strings.title;
  }, [settings, strings.title]);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      const nextSettings = normalizeSettings({
        ...settingsRef.current,
        ...patch,
      });
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      setSaveFailed(false);

      client
        .saveSettings(nextSettings)
        .then((result) => {
          setSaveFailed(!result.success);
        })
        .catch(() => {
          setSaveFailed(true);
        });
    },
    [client]
  );

  const errorMessage = loadFailed
    ? strings.loadError
    : saveFailed
      ? strings.saveError
      : null;

  return (
    <main className="min-h-screen bg-neutral-50 px-7 py-6 text-neutral-950 transition-colors dark:bg-neutral-950 dark:text-neutral-50">
      <header className="mb-6 pt-2 [-webkit-app-region:drag]">
        <h1 className="font-semibold text-xl tracking-normal">
          {strings.title}
        </h1>
      </header>

      <section aria-labelledby="settings-heading" className="space-y-5">
        <h2 className="sr-only" id="settings-heading">
          {strings.title}
        </h2>
        <SettingsSelect
          id="settings-language"
          label={strings.language}
          onValueChange={(locale) => {
            updateSettings({ locale });
          }}
          options={languageOptions}
          value={settings.locale}
        />
        <SettingsSelect
          id="settings-theme"
          label={strings.theme}
          onValueChange={(theme) => {
            updateSettings({ theme });
          }}
          options={themeOptions}
          value={settings.theme}
        />
        <SettingsSelect
          id="settings-default-layout"
          label={strings.defaultLayout}
          onValueChange={(defaultLayoutMode) => {
            updateSettings({ defaultLayoutMode });
          }}
          options={layoutOptions}
          value={settings.defaultLayoutMode}
        />
        {errorMessage ? (
          <p className="text-red-600 text-sm dark:text-red-400" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </section>
    </main>
  );
}

export { SettingsApp };
