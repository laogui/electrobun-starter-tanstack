import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as m from "../../paraglide/messages.js";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      toast.error(`Error: ${error.message}`, {
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
