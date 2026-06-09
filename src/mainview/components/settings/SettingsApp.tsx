import {
  Info,
  Keyboard,
  Settings as SettingsIcon,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  AI_PROVIDER_OPTIONS,
  type AIProviderSetting,
  type AppSettings,
  AUTO_SAVE_INTERVAL_OPTIONS,
  type AutoSaveIntervalSetting,
  type CanvasBackgroundSetting,
  DEFAULT_SETTINGS,
  type FontFamilySetting,
  type LocaleSetting,
  type SettingsClient,
  type ThemeSetting,
} from '@/settingsClient';

import {
  getLocaleStrings,
  type SettingsLocaleStrings,
} from './i18n/getLocaleStrings';
import { AboutPanel } from './panels/AboutPanel';
import { AIPanel } from './panels/AIPanel';
import { GeneralPanel } from './panels/GeneralPanel';
import { ShortcutsPanel } from './panels/ShortcutsPanel';
import { WorkspacePanel } from './panels/WorkspacePanel';

const THEME_VALUES: readonly ThemeSetting[] = ['system', 'light', 'dark'];
const LOCALE_VALUES: readonly LocaleSetting[] = ['en', 'zh'];
const FONT_VALUES: readonly FontFamilySetting[] = ['system', 'serif', 'mono'];
const CANVAS_BG_VALUES: readonly CanvasBackgroundSetting[] = [
  'default',
  'paper',
  'mono',
];

function includesValue<TValue extends number | string>(
  values: readonly TValue[],
  value: unknown
): value is TValue {
  return values.includes(value as TValue);
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
    fontFamily: includesValue(FONT_VALUES, settings?.fontFamily)
      ? settings.fontFamily
      : DEFAULT_SETTINGS.fontFamily,
    canvasBackground: includesValue(
      CANVAS_BG_VALUES,
      settings?.canvasBackground
    )
      ? settings.canvasBackground
      : DEFAULT_SETTINGS.canvasBackground,
    canvasSnapToGrid:
      typeof settings?.canvasSnapToGrid === 'boolean'
        ? settings.canvasSnapToGrid
        : DEFAULT_SETTINGS.canvasSnapToGrid,
    autoSaveInterval: includesValue(
      AUTO_SAVE_INTERVAL_OPTIONS,
      settings?.autoSaveInterval
    )
      ? (settings.autoSaveInterval as AutoSaveIntervalSetting)
      : DEFAULT_SETTINGS.autoSaveInterval,
    aiEnabled:
      typeof settings?.aiEnabled === 'boolean'
        ? settings.aiEnabled
        : DEFAULT_SETTINGS.aiEnabled,
    aiProvider: includesValue(AI_PROVIDER_OPTIONS, settings?.aiProvider)
      ? (settings.aiProvider as AIProviderSetting)
      : DEFAULT_SETTINGS.aiProvider,
    aiModel:
      typeof settings?.aiModel === 'string' && settings.aiModel.length > 0
        ? settings.aiModel
        : DEFAULT_SETTINGS.aiModel,
    aiBaseUrl:
      typeof settings?.aiBaseUrl === 'string'
        ? settings.aiBaseUrl
        : DEFAULT_SETTINGS.aiBaseUrl,
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

type SettingsSection = 'about' | 'ai' | 'general' | 'shortcuts' | 'workspace';

interface NavItem {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  id: SettingsSection;
  labelKey: keyof Pick<
    SettingsLocaleStrings,
    'navAbout' | 'navAi' | 'navGeneral' | 'navShortcuts' | 'navWorkspace'
  >;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'general', icon: SettingsIcon, labelKey: 'navGeneral' },
  { id: 'workspace', icon: Wrench, labelKey: 'navWorkspace' },
  { id: 'ai', icon: Sparkles, labelKey: 'navAi' },
  { id: 'shortcuts', icon: Keyboard, labelKey: 'navShortcuts' },
  { id: 'about', icon: Info, labelKey: 'navAbout' },
];

interface SettingsAppProps {
  client: SettingsClient;
}

export function SettingsApp({ client }: SettingsAppProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeSection, setActiveSection] =
    useState<SettingsSection>('general');
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const settingsRef = useRef(settings);

  const strings = getLocaleStrings(settings.locale);

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

  const errorMessage = useMemo(
    () =>
      loadFailed ? strings.loadError : saveFailed ? strings.saveError : null,
    [loadFailed, saveFailed, strings.loadError, strings.saveError]
  );

  return (
    <main className="flex h-screen min-h-0 bg-neutral-50 text-neutral-950 transition-colors dark:bg-neutral-950 dark:text-neutral-50">
      <Sidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
        strings={strings}
        title={strings.title}
      />

      <section
        aria-labelledby="settings-active-section-heading"
        className="min-w-0 flex-1 overflow-y-auto px-7 pt-12 pb-8"
      >
        <h2 className="sr-only" id="settings-active-section-heading">
          {
            strings[
              NAV_ITEMS.find((n) => n.id === activeSection)?.labelKey ??
                'navGeneral'
            ]
          }
        </h2>
        {activeSection === 'general' ? (
          <GeneralPanel
            errorMessage={errorMessage}
            onUpdate={updateSettings}
            settings={settings}
            strings={strings}
          />
        ) : null}
        {activeSection === 'workspace' ? (
          <WorkspacePanel
            client={client}
            locale={settings.locale}
            strings={strings}
          />
        ) : null}
        {activeSection === 'ai' ? (
          <AIPanel
            client={client}
            onUpdate={updateSettings}
            settings={settings}
            strings={strings}
          />
        ) : null}
        {activeSection === 'shortcuts' ? (
          <ShortcutsPanel strings={strings} />
        ) : null}
        {activeSection === 'about' ? (
          <AboutPanel client={client} strings={strings} />
        ) : null}
      </section>
    </main>
  );
}

interface SidebarProps {
  activeSection: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  strings: SettingsLocaleStrings;
  title: string;
}

function Sidebar({ activeSection, onSelect, strings, title }: SidebarProps) {
  return (
    <aside
      aria-label={title}
      className="flex w-44 shrink-0 flex-col border-neutral-200 border-r bg-neutral-100/60 pt-9 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/40"
    >
      <header className="flex items-center px-4 pt-2 pb-3 [-webkit-app-region:drag]">
        <h1 className="font-semibold text-[14px] text-neutral-900 tracking-normal dark:text-neutral-50">
          {title}
        </h1>
      </header>
      <nav aria-label={title} className="flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              aria-current={isActive ? 'page' : undefined}
              className={`flex h-8 items-center gap-2 rounded-md px-2 font-medium text-[12px] transition-colors [-webkit-app-region:no-drag] focus-visible:outline-2 focus-visible:outline-blue-500/60 ${
                isActive
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-50'
                  : 'text-neutral-600 hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-neutral-50'
              }`}
              key={item.id}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <Icon
                className={
                  isActive
                    ? 'text-neutral-700 dark:text-neutral-200'
                    : 'text-neutral-500 dark:text-neutral-400'
                }
                size={13}
              />
              <span className="truncate">{strings[item.labelKey]}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
