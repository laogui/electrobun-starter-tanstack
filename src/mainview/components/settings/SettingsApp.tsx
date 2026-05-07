import { Dialog } from '@base-ui/react/dialog';
import { RotateCcw, Trash2 } from 'lucide-react';
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
  TRASH_UPDATED_EVENT,
  type TrashEntry,
} from '@/settingsClient';

const THEME_VALUES: readonly ThemeSetting[] = ['system', 'light', 'dark'];
const LOCALE_VALUES: readonly LocaleSetting[] = ['en', 'zh'];
const LAYOUT_VALUES: readonly DefaultLayoutMode[] = ['canvas', 'document'];

interface SelectOption<TValue extends string> {
  label: string;
  value: TValue;
}

interface SettingsLocaleStrings {
  canvas: string;
  dark: string;
  defaultLayout: string;
  document: string;
  language: string;
  light: string;
  loadError: string;
  purgeConfirmAction: string;
  purgeConfirmBody: (name: string) => string;
  purgeConfirmCancel: string;
  purgeConfirmTitle: string;
  saveError: string;
  system: string;
  theme: string;
  title: string;
  trashDeletedAt: (when: string) => string;
  trashEmpty: string;
  trashLoadError: string;
  trashPurgeAria: (name: string) => string;
  trashPurgeFailed: string;
  trashRestoreAria: (name: string) => string;
  trashRestoreFailed: string;
  trashTitle: string;
}

const localeStrings: Record<LocaleSetting, SettingsLocaleStrings> = {
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
    trashTitle: 'Deleted Canvases',
    trashEmpty: 'No deleted canvases.',
    trashDeletedAt: (when) => `Deleted ${when}`,
    trashRestoreAria: (name) => `Restore ${name}`,
    trashPurgeAria: (name) => `Permanently delete ${name}`,
    trashLoadError: 'Unable to load deleted canvases.',
    trashRestoreFailed: 'Unable to restore canvas.',
    trashPurgeFailed: 'Unable to permanently delete canvas.',
    purgeConfirmTitle: 'Permanently delete canvas?',
    purgeConfirmBody: (name) =>
      `"${name}" will be permanently deleted. This cannot be undone.`,
    purgeConfirmCancel: 'Cancel',
    purgeConfirmAction: 'Delete Forever',
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
    trashTitle: '已删除的画布',
    trashEmpty: '没有已删除的画布。',
    trashDeletedAt: (when) => `删除于 ${when}`,
    trashRestoreAria: (name) => `恢复 ${name}`,
    trashPurgeAria: (name) => `永久删除 ${name}`,
    trashLoadError: '无法加载已删除的画布。',
    trashRestoreFailed: '无法恢复画布。',
    trashPurgeFailed: '无法永久删除画布。',
    purgeConfirmTitle: '永久删除画布？',
    purgeConfirmBody: (name) => `“${name}”将被永久删除，无法恢复。`,
    purgeConfirmCancel: '取消',
    purgeConfirmAction: '永久删除',
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

      <TrashSection
        client={client}
        locale={settings.locale}
        strings={strings}
      />
    </main>
  );
}

interface TrashSectionProps {
  client: SettingsClient;
  locale: LocaleSetting;
  strings: SettingsLocaleStrings;
}

function TrashSection({ client, locale, strings }: TrashSectionProps) {
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingPurge, setPendingPurge] = useState<TrashEntry | null>(null);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale]
  );

  const reload = useCallback(async () => {
    try {
      const data = await client.listTrash();
      setEntries(data);
      setLoaded(true);
      setLoadFailed(false);
    } catch {
      setLoaded(true);
      setLoadFailed(true);
    }
  }, [client]);

  useEffect(() => {
    reload();
    const handleTrashUpdated = () => {
      reload();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        reload();
      }
    };
    globalThis.addEventListener(TRASH_UPDATED_EVENT, handleTrashUpdated);
    document.addEventListener('visibilitychange', handleVisibility);
    globalThis.addEventListener('focus', handleTrashUpdated);
    return () => {
      globalThis.removeEventListener(TRASH_UPDATED_EVENT, handleTrashUpdated);
      document.removeEventListener('visibilitychange', handleVisibility);
      globalThis.removeEventListener('focus', handleTrashUpdated);
    };
  }, [reload]);

  const handleRestore = useCallback(
    async (entry: TrashEntry) => {
      setActionError(null);
      try {
        const result = await client.restoreTrash(entry.trashId);
        if (!result.success) {
          setActionError(strings.trashRestoreFailed);
          return;
        }
        await reload();
      } catch {
        setActionError(strings.trashRestoreFailed);
      }
    },
    [client, reload, strings.trashRestoreFailed]
  );

  const handlePurge = useCallback(
    async (entry: TrashEntry) => {
      setActionError(null);
      setPendingPurge(null);
      try {
        const result = await client.purgeTrash(entry.trashId);
        if (!result.success) {
          setActionError(strings.trashPurgeFailed);
          return;
        }
        await reload();
      } catch {
        setActionError(strings.trashPurgeFailed);
      }
    },
    [client, reload, strings.trashPurgeFailed]
  );

  if (!loaded) {
    return null;
  }

  return (
    <section
      aria-labelledby="settings-trash-heading"
      className="mt-8 space-y-3"
    >
      <h2
        className="font-medium text-neutral-600 text-xs dark:text-neutral-300"
        id="settings-trash-heading"
      >
        {strings.trashTitle}
      </h2>
      {loadFailed ? (
        <p className="text-red-600 text-sm dark:text-red-400" role="alert">
          {strings.trashLoadError}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-neutral-500 text-sm dark:text-neutral-400">
          {strings.trashEmpty}
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <TrashRow
              dateFormatter={dateFormatter}
              entry={entry}
              key={entry.trashId}
              onPurge={() => setPendingPurge(entry)}
              onRestore={() => handleRestore(entry)}
              strings={strings}
            />
          ))}
        </ul>
      )}
      {actionError ? (
        <p className="text-red-600 text-sm dark:text-red-400" role="alert">
          {actionError}
        </p>
      ) : null}
      <PurgeConfirmDialog
        entry={pendingPurge}
        onCancel={() => setPendingPurge(null)}
        onConfirm={(entry) => {
          handlePurge(entry);
        }}
        strings={strings}
      />
    </section>
  );
}

interface TrashRowProps {
  dateFormatter: Intl.DateTimeFormat;
  entry: TrashEntry;
  onPurge: () => void;
  onRestore: () => void;
  strings: SettingsLocaleStrings;
}

function TrashRow({
  dateFormatter,
  entry,
  onPurge,
  onRestore,
  strings,
}: TrashRowProps) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="min-w-0">
        <p className="truncate font-medium text-neutral-900 text-sm dark:text-neutral-100">
          {entry.view.name}
        </p>
        <p className="text-neutral-500 text-xs dark:text-neutral-400">
          {strings.trashDeletedAt(dateFormatter.format(entry.deletedAt))}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          aria-label={strings.trashRestoreAria(entry.view.name)}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 font-medium text-[12px] text-neutral-700 transition-colors [-webkit-app-region:no-drag] hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-200 dark:hover:bg-white/10 dark:hover:text-white"
          onClick={onRestore}
          type="button"
        >
          <RotateCcw size={13} />
        </button>
        <button
          aria-label={strings.trashPurgeAria(entry.view.name)}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 font-medium text-[12px] text-red-600 transition-colors [-webkit-app-region:no-drag] hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
          onClick={onPurge}
          type="button"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

interface PurgeConfirmDialogProps {
  entry: TrashEntry | null;
  onCancel: () => void;
  onConfirm: (entry: TrashEntry) => void;
  strings: SettingsLocaleStrings;
}

function PurgeConfirmDialog({
  entry,
  onCancel,
  onConfirm,
  strings,
}: PurgeConfirmDialogProps) {
  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
      open={entry !== null}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-[60] w-[min(380px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl outline-hidden transition-[transform,opacity] duration-150 data-ending-style:scale-95 data-starting-style:scale-95 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-neutral-900">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <Trash2 size={17} />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="font-semibold text-gray-900 text-sm dark:text-gray-100">
                {strings.purgeConfirmTitle}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-[13px] text-gray-600 leading-5 dark:text-gray-300">
                {entry ? strings.purgeConfirmBody(entry.view.name) : ''}
              </Dialog.Description>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="h-8 rounded-md px-3 font-medium text-[13px] text-gray-600 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={onCancel}
              type="button"
            >
              {strings.purgeConfirmCancel}
            </button>
            <button
              className="h-8 rounded-md bg-red-600 px-3 font-medium text-[13px] text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2 dark:bg-red-500 dark:hover:bg-red-400"
              onClick={() => {
                if (entry) {
                  onConfirm(entry);
                }
              }}
              type="button"
            >
              {strings.purgeConfirmAction}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { SettingsApp };
