import {
  Info,
  Keyboard,
  Puzzle,
  Settings as SettingsIcon,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  type SettingsClient,
} from '@/settingsClient';

import {
  getLocaleStrings,
  type SettingsLocaleStrings,
} from './i18n/getLocaleStrings';
import { AboutPanel } from './panels/AboutPanel';
import { AIPanel } from './panels/AIPanel';
import { CanvasTypesPanel } from './panels/CanvasTypesPanel';
import { GeneralPanel } from './panels/GeneralPanel';
import { ShortcutsPanel } from './panels/ShortcutsPanel';
import { WorkspacePanel } from './panels/WorkspacePanel';
import { applyTheme, normalizeSettings } from './settingsState';

type SettingsSection =
  | 'about'
  | 'ai'
  | 'canvasTypes'
  | 'general'
  | 'shortcuts'
  | 'workspace';

interface NavItem {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  id: SettingsSection;
  labelKey: keyof Pick<
    SettingsLocaleStrings,
    | 'navAbout'
    | 'navAi'
    | 'navCanvasTypes'
    | 'navGeneral'
    | 'navShortcuts'
    | 'navWorkspace'
  >;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'general', icon: SettingsIcon, labelKey: 'navGeneral' },
  { id: 'workspace', icon: Wrench, labelKey: 'navWorkspace' },
  { id: 'canvasTypes', icon: Puzzle, labelKey: 'navCanvasTypes' },
  { id: 'ai', icon: Sparkles, labelKey: 'navAi' },
  { id: 'shortcuts', icon: Keyboard, labelKey: 'navShortcuts' },
  { id: 'about', icon: Info, labelKey: 'navAbout' },
];

const SETTINGS_SCROLLBAR_OPTIONS = {
  overflow: { x: 'hidden' },
  scrollbars: {
    autoHide: 'leave',
    autoHideDelay: 450,
    clickScroll: true,
    theme: 'os-theme-settings',
  },
} as const;

interface SettingsAppProps {
  client: SettingsClient;
  manageDocument?: boolean;
  onSettingsChange?: (settings: AppSettings) => void;
  variant?: 'dialog' | 'window';
}

export function SettingsApp({
  client,
  manageDocument = true,
  onSettingsChange,
  variant = 'window',
}: SettingsAppProps) {
  const [settingsState, setSettingsState] = useState(() => ({
    loadFailed: false,
    saveFailed: false,
    settings: DEFAULT_SETTINGS,
  }));
  const [activeSection, setActiveSection] =
    useState<SettingsSection>('general');
  const { loadFailed, saveFailed, settings } = settingsState;
  const settingsRef = useRef(settings);

  // Bottom fade hint for the dialog scroll container: revealed only while the
  // content can still scroll further down, so a half-cut last row doesn't read
  // as a broken layout. Targets the OverlayScrollbars `.os-viewport` element.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  useEffect(() => {
    if (variant !== 'dialog') {
      return;
    }
    const host = scrollContainerRef.current;
    const viewport = host?.querySelector<HTMLElement>('.os-viewport');
    const el = viewport ?? host;
    if (!el) {
      return;
    }
    const update = () => {
      setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    // Watch the scroll container's content box: swapping settings panels swaps
    // the content and changes its height, which flips the fade state without
    // needing to re-run the effect on section change.
    const content = host?.querySelector<HTMLElement>('.os-content');
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(content ?? el);
    return () => {
      el.removeEventListener('scroll', update);
      resizeObserver.disconnect();
    };
  }, [variant]);

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
        setSettingsState((current) => ({
          ...current,
          loadFailed: false,
          settings: normalizedSettings,
        }));
        onSettingsChange?.(normalizedSettings);
      })
      .catch(() => {
        if (mounted) {
          setSettingsState((current) => ({ ...current, loadFailed: true }));
        }
      });

    return () => {
      mounted = false;
    };
  }, [client, onSettingsChange]);

  useEffect(() => {
    settingsRef.current = settings;
    if (!manageDocument) {
      return;
    }
    applyTheme(settings.theme);
    document.documentElement.lang = settings.locale;
    document.title = strings.title;
  }, [manageDocument, settings, strings.title]);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      const nextSettings = normalizeSettings({
        ...settingsRef.current,
        ...patch,
      });
      settingsRef.current = nextSettings;
      setSettingsState((current) => ({
        ...current,
        saveFailed: false,
        settings: nextSettings,
      }));
      onSettingsChange?.(nextSettings);

      client
        .saveSettings(nextSettings)
        .then((result) => {
          setSettingsState((current) => ({
            ...current,
            saveFailed: !result.success,
          }));
        })
        .catch(() => {
          setSettingsState((current) => ({ ...current, saveFailed: true }));
        });
    },
    [client, onSettingsChange]
  );

  const errorMessage = loadFailed
    ? strings.loadError
    : saveFailed
      ? strings.saveError
      : null;

  const Shell = variant === 'window' ? 'main' : 'div';

  return (
    <Shell
      className={`flex min-h-0 bg-neutral-50 text-neutral-950 transition-colors dark:bg-neutral-950 dark:text-neutral-50 ${
        variant === 'window' ? 'h-screen' : 'h-full'
      }`}
    >
      <Sidebar
        activeSection={activeSection}
        draggableHeader={variant === 'window'}
        onSelect={setActiveSection}
        strings={strings}
        title={strings.title}
      />

      {variant === 'dialog' ? (
        <div
          className="relative flex min-w-0 flex-1 flex-col"
          ref={scrollContainerRef}
        >
          <OverlayScrollbarsComponent
            aria-labelledby="settings-active-section-heading"
            className="settings-scrollbar min-h-0 min-w-0 flex-1"
            defer
            element="section"
            options={SETTINGS_SCROLLBAR_OPTIONS}
          >
            <div className="px-7 pt-12 pb-8">
              <SettingsContent
                activeSection={activeSection}
                client={client}
                errorMessage={errorMessage}
                locale={settings.locale}
                onUpdate={updateSettings}
                settings={settings}
                strings={strings}
              />
            </div>
          </OverlayScrollbarsComponent>
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-xl bg-gradient-to-t from-neutral-50 to-transparent transition-opacity duration-200 dark:from-neutral-950',
              hasMoreBelow ? 'opacity-100' : 'opacity-0'
            )}
          />
        </div>
      ) : (
        <section
          aria-labelledby="settings-active-section-heading"
          className="min-w-0 flex-1 overflow-y-auto px-7 pt-12 pb-8"
        >
          <SettingsContent
            activeSection={activeSection}
            client={client}
            errorMessage={errorMessage}
            locale={settings.locale}
            onUpdate={updateSettings}
            settings={settings}
            strings={strings}
          />
        </section>
      )}
    </Shell>
  );
}

interface SettingsContentProps {
  activeSection: SettingsSection;
  client: SettingsClient;
  errorMessage: string | null;
  locale: AppSettings['locale'];
  onUpdate: (patch: Partial<AppSettings>) => void;
  settings: AppSettings;
  strings: SettingsLocaleStrings;
}

function SettingsContent({
  activeSection,
  client,
  errorMessage,
  locale,
  onUpdate,
  settings,
  strings,
}: SettingsContentProps) {
  return (
    <>
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
          onUpdate={onUpdate}
          settings={settings}
          strings={strings}
        />
      ) : null}
      {activeSection === 'workspace' ? (
        <WorkspacePanel client={client} locale={locale} strings={strings} />
      ) : null}
      {activeSection === 'canvasTypes' ? (
        <CanvasTypesPanel locale={locale} strings={strings} />
      ) : null}
      {activeSection === 'ai' ? (
        <AIPanel
          client={client}
          onUpdate={onUpdate}
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
    </>
  );
}

interface SidebarProps {
  activeSection: SettingsSection;
  draggableHeader: boolean;
  onSelect: (section: SettingsSection) => void;
  strings: SettingsLocaleStrings;
  title: string;
}

function Sidebar({
  activeSection,
  draggableHeader,
  onSelect,
  strings,
  title,
}: SidebarProps) {
  return (
    <aside
      aria-label={title}
      className="flex w-44 shrink-0 flex-col border-neutral-200 border-r bg-neutral-100/60 pt-9 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/40"
    >
      <header
        className={`flex items-center px-4 pt-2 pb-3 ${
          draggableHeader ? '[-webkit-app-region:drag]' : ''
        }`}
      >
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
              className={`flex h-8 items-center gap-2 rounded-md px-2 font-medium text-[12px] transition-colors [-webkit-app-region:no-drag] focus-visible:outline-2 focus-visible:outline-accent/60 ${
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
