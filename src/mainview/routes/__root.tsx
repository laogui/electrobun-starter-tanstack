import { TanStackDevtools } from '@tanstack/react-devtools';
import { formDevtoolsPlugin } from '@tanstack/react-form-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { useTheme } from 'better-themes';
import { Settings } from 'lucide-react';
import { useEffect } from 'react';

import { Toaster } from '@/components/ui/Toaster';
import { rpcGetSettings, rpcOpenSettings } from '@/lib/rpc';

import { setLocale } from '../../paraglide/runtime.js';

export interface RouterAppContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootDocument,
});

function RootDocument() {
  const { setTheme } = useTheme();

  // Pull persisted settings on mount
  useEffect(() => {
    rpcGetSettings().then((s) => {
      if (!s) {
        return;
      }
      setTheme(s.theme);
      setLocale(s.locale as 'en' | 'zh');
    });
  }, [setTheme]);

  // Listen for live pushes from the settings window
  useEffect(() => {
    const handler = (e: Event) => {
      const { theme, locale } = (e as CustomEvent).detail;
      setTheme(theme);
      setLocale(locale as 'en' | 'zh');
    };
    globalThis.addEventListener('settings-updated', handler);
    return () => {
      globalThis.removeEventListener('settings-updated', handler);
    };
  }, [setTheme]);

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

      {/* Draggable titlebar — holds traffic lights (macOS) + settings icon */}
      <div
        className="electrobun-webkit-app-region-drag fixed inset-x-0 top-0 z-50 flex h-10 select-none items-center justify-end gap-2 border-black/5 border-b bg-stone-50/55 px-3 backdrop-blur-md dark:border-white/5 dark:bg-[#141414]/45"
        data-testid="app-titlebar"
      >
        <div className="flex-1" />
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
