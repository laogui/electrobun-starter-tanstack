import { TanStackDevtools } from '@tanstack/react-devtools';
import { formDevtoolsPlugin } from '@tanstack/react-form-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
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
    void rpcGetSettings().then((s) => {
      if (!s) return;
      setTheme(s.theme);
      void setLocale(s.locale as 'en' | 'zh');
    });
  }, [setTheme]);

  // Listen for live pushes from the settings window
  useEffect(() => {
    const handler = (e: Event) => {
      const { theme, locale } = (e as CustomEvent).detail;
      setTheme(theme);
      void setLocale(locale as 'en' | 'zh');
    };
    globalThis.addEventListener('settings-updated', handler);
    return () => {
      globalThis.removeEventListener('settings-updated', handler);
    };
  }, [setTheme]);

  return (
    <>
      {/* Draggable titlebar — holds traffic lights (macOS) + settings icon */}
      <div className='electrobun-webkit-app-region-drag fixed inset-x-0 top-0 z-50 flex h-10 items-center justify-end gap-2 border-b border-black/5 bg-transparent px-3 select-none dark:border-white/5'>
        <div className='flex-1' />
        <button
          type='button'
          className='electrobun-webkit-app-region-no-drag flex items-center justify-center rounded-md p-1.5 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200'
          aria-label='Settings'
          onClick={() => {
            void rpcOpenSettings();
          }}
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
