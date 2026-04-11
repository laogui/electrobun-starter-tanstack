import { QueryClientProvider } from '@tanstack/react-query';
import {
  createHashHistory,
  createRouter as createTanStackRouter,
} from '@tanstack/react-router';

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
  defaultPendingComponent: () => <Loader />,
  defaultErrorComponent: ErrorBoundaryFallback,
  defaultNotFoundComponent: () => <div>Not Found</div>,
  Wrap: ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {}
}
