import { QueryClientProvider } from '@tanstack/react-query';
import {
  createHashHistory,
  createRouter as createTanStackRouter,
} from '@tanstack/react-router';
import { createElement } from 'react';

import { ErrorBoundaryFallback } from '@/components/layout/ErrorBoundaryFallback';
import { Loader } from '@/components/layout/Loader';
import { queryClient } from '@/lib/queryClient';

import { routeTree } from './routeTree.gen';

const isHttpProtocol = ['http:', 'https:'].includes(
  globalThis.location.protocol
);

export const router = createTanStackRouter({
  routeTree,
  history: isHttpProtocol ? undefined : createHashHistory(),
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
  context: { queryClient },
  defaultPendingComponent: () => createElement(Loader),
  defaultErrorComponent: ErrorBoundaryFallback,
  defaultNotFoundComponent: () => createElement('div', null, 'Not Found'),
  Wrap: ({ children }) =>
    createElement(QueryClientProvider, { client: queryClient }, children),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {}
}
