import { TanStackDevtools } from '@tanstack/react-devtools';
import { formDevtoolsPlugin } from '@tanstack/react-form-devtools';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import {
  createRootRouteWithContext,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { useTheme } from 'better-themes';
import { Search, Settings } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { Toaster } from '@/components/ui/Toaster';
import { useTitlebarDragReleaseFix } from '@/hooks/useTitlebarDragReleaseFix';
import { rpcGetSettings, rpcOpenSettings } from '@/lib/rpc';
import { refreshLicense } from '@/lib/rpc-license';
import type { AppSettings, FontFamilySetting } from '@/settingsClient';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../paraglide/messages.js';
import { setLocale } from '../../paraglide/runtime.js';

/**
 * Map font preference → font-family stack applied via inline style on
 * `<html>`. `system` removes the override so the document falls back to the
 * `--font-sans` token defined in `index.css` (a tuned system-UI stack, not a
 * bundled webfont). The `serif` and `mono` stacks mirror the `--font-serif`
 * and `--font-mono` tokens there; keep them in sync.
 */
const FONT_FAMILY_STACKS: Record<FontFamilySetting, string | null> = {
  system: null,
  serif:
    "'Iowan Old Style', 'Apple Garamond', Baskerville, 'Times New Roman', 'Droid Serif', Times, serif",
  mono: "ui-monospace, 'SF Mono', SFMono-Regular, 'JetBrains Mono', Menlo, monospace",
};

function applyFontFamily(font: FontFamilySetting) {
  const stack = FONT_FAMILY_STACKS[font];
  if (stack) {
    document.documentElement.style.setProperty('font-family', stack);
  } else {
    document.documentElement.style.removeProperty('font-family');
  }
}

const isMac =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);

const TITLEBAR_HEIGHT_CSS_VAR = '--app-titlebar-height';

export interface RouterAppContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootDocument,
});

function RootDocument() {
  const { setTheme } = useTheme();
  const titlebarRef = useTitlebarHeightVar();
  useTitlebarDragReleaseFix();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const setSearchOpen = useCanvasStore((s) => s.setSearchOpen);
  const applyAppSettings = useAppSettingsStore((s) => s.applySettings);
  const showSearchBox = pathname === '/';
  useQuery({
    queryKey: ['license-status'],
    queryFn: refreshLicense,
  });

  // Centralized settings application: theme via better-themes, locale via
  // paraglide, fontFamily via inline style on <html>, and the rest stored
  // in `useAppSettingsStore` so nested components (FocusedView,
  // routes/index.tsx) can subscribe to specific slices without prop drilling.
  const applyAll = useCallback(
    (settings: AppSettings) => {
      setTheme(settings.theme);
      setLocale(settings.locale as 'en' | 'zh');
      applyFontFamily(settings.fontFamily);
      applyAppSettings(settings);
    },
    [applyAppSettings, setTheme]
  );

  // Pull persisted settings on mount
  useEffect(() => {
    rpcGetSettings().then((s) => {
      if (!s) {
        return;
      }
      applyAll(s as AppSettings);
    });
  }, [applyAll]);

  // Listen for live pushes from the settings window
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Partial<AppSettings>;
      if (!detail) {
        return;
      }
      // Defensive merge: the settings window always pushes the full payload,
      // but typing as Partial lets older builds (or tests dispatching the
      // event manually) ship subsets without crashing.
      const current = useAppSettingsStore.getState();
      applyAll({ ...current, ...detail });
    };
    globalThis.addEventListener('settings-updated', handler);
    return () => {
      globalThis.removeEventListener('settings-updated', handler);
    };
  }, [applyAll]);

  return (
    <>
      {/* Custom SVG marker definitions for edge arrows */}
      <svg
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          overflow: 'hidden',
        }}
      >
        <defs>
          {/* Open chevron arrow — tip aligns exactly with the node edge */}
          <marker
            id="compact-arrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto-start-reverse"
            refX="7"
            refY="4"
            viewBox="0 0 8 8"
          >
            <path
              d="M1,1 L7,4 L1,7"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </marker>
          <marker
            id="compact-arrow-active"
            markerHeight="8"
            markerWidth="8"
            orient="auto-start-reverse"
            refX="7"
            refY="4"
            viewBox="0 0 8 8"
          >
            <path
              d="M1,1 L7,4 L1,7"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </marker>
        </defs>
      </svg>

      {/* Draggable titlebar — traffic lights (macOS) + settings */}
      <div
        className="electrobun-webkit-app-region-drag fixed inset-x-0 top-0 z-50 flex h-10 select-none items-center gap-2 border-black/5 border-b bg-stone-50/55 px-3 backdrop-blur-md dark:border-white/5 dark:bg-[#141414]/45"
        data-testid="app-titlebar"
        ref={titlebarRef}
      >
        <div className="flex-1" />
        <div className="flex flex-1 justify-center">
          {showSearchBox ? (
            <button
              aria-label={m.search_button_aria()}
              className="electrobun-webkit-app-region-no-drag flex h-7 w-full min-w-[14rem] max-w-md items-center gap-2 rounded-md border border-black/5 bg-white/70 px-2.5 text-left text-neutral-500 text-xs shadow-sm transition-colors hover:bg-white hover:text-neutral-700 dark:border-white/5 dark:bg-neutral-800/70 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              data-testid="titlebar-search-trigger"
              onClick={() => {
                setSearchOpen(true);
              }}
              type="button"
            >
              <Search size={13} strokeWidth={1.8} />
              <span className="flex-1 truncate">
                {m.titlebar_search_placeholder()}
              </span>
              <kbd className="hidden text-3xs text-neutral-500 sm:inline dark:text-neutral-400">
                {isMac ? '⌘K' : '⌃K'}
              </kbd>
            </button>
          ) : null}
        </div>
        <div className="flex flex-1 justify-end">
          <button
            aria-label="Settings"
            className="electrobun-webkit-app-region-no-drag flex items-center justify-center rounded-md p-1.5 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
            onClick={() => {
              rpcOpenSettings();
            }}
            type="button"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
      <Outlet />
      <Toaster richColors />

      <TanStackDevtools
        config={{
          position: 'bottom-right',
          hideUntilHover: true,
        }}
        plugins={[
          {
            name: 'TanStack Query',
            render: <ReactQueryDevtoolsPanel />,
          },
          {
            name: 'TanStack Router',
            render: <TanStackRouterDevtoolsPanel />,
          },
          formDevtoolsPlugin(),
        ]}
      />
    </>
  );
}

function useTitlebarHeightVar() {
  const titlebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const titlebar = titlebarRef.current;
    if (!titlebar) {
      return;
    }

    const updateTitlebarHeight = () => {
      const measuredHeight =
        titlebar.getBoundingClientRect().height || titlebar.offsetHeight;

      if (measuredHeight > 0) {
        document.documentElement.style.setProperty(
          TITLEBAR_HEIGHT_CSS_VAR,
          `${measuredHeight}px`
        );
      }
    };

    updateTitlebarHeight();
    window.addEventListener('resize', updateTitlebarHeight);

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateTitlebarHeight);
    resizeObserver?.observe(titlebar);

    return () => {
      window.removeEventListener('resize', updateTitlebarHeight);
      resizeObserver?.disconnect();
      document.documentElement.style.removeProperty(TITLEBAR_HEIGHT_CSS_VAR);
    };
  }, []);

  return titlebarRef;
}
