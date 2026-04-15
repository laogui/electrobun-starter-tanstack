import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import * as m from '../../paraglide/messages.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      const message =
        error instanceof Error
          ? error.message
          : String(error ?? 'Unknown error');
      toast.error(`Error: ${message}`, {
        action: {
          label: m.action_retry(),
          onClick: () => {
            query.invalidate();
          },
        },
      });
    },
  }),
});
