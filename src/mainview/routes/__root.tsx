import { TanStackDevtools } from '@tanstack/react-devtools';
import { formDevtoolsPlugin } from '@tanstack/react-form-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { useTheme } from 'better-themes';

import { Toaster } from '@/components/ui/Toaster';

import * as m from '../../paraglide/messages.js';
import { getLocale, setLocale } from '../../paraglide/runtime.js';

export interface RouterAppContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootDocument,
});

function RootDocument() {
  const { setTheme, theme } = useTheme();

  return (
    <>
      {/* Draggable titlebar — holds traffic lights (macOS) + nav controls */}
      <div className='electrobun-webkit-app-region-drag fixed top-0 left-0 right-0 z-50 flex h-10 items-center justify-end gap-2 px-3 bg-stone-50/80 backdrop-blur-sm dark:bg-[#141414]/80 border-b border-black/5 dark:border-white/5 select-none'>
        {/* Left side: macOS traffic lights sit here via hiddenInset padding */}
        <div className='flex-1' />
        {/* Right side: interactive controls — must be no-drag */}
        <select
          value={theme}
          className='electrobun-webkit-app-region-no-drag rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
          onChange={(e) => {
            setTheme(e.target.value);
          }}
        >
          <option value='system'>System</option>
          <option value='light'>Light</option>
          <option value='dark'>Dark</option>
        </select>
        <select
          value={getLocale()}
          className='electrobun-webkit-app-region-no-drag rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
          onChange={(e) => {
            void setLocale(e.target.value as 'en' | 'zh');
          }}
        >
          <option value='en'>English</option>
          <option value='zh'>中文</option>
        </select>
      </div>
      {/* Main content — offset by titlebar height */}
      <div className='pt-10'>
        <Outlet />
      </div>
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
