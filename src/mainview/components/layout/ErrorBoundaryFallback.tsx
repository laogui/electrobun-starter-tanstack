import type { ErrorComponentProps } from "@tanstack/react-router";
import { ErrorComponent, useRouter } from "@tanstack/react-router";
import * as m from "../../../paraglide/messages.js";

export function ErrorBoundaryFallback({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  if (import.meta.env.DEV) {
    return <ErrorComponent error={error} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div>Error</div>
      <button
        type="button"
        onClick={() => {
          reset();
          void router.invalidate();
        }}
      >
        Reset
      </button>
    </div>
  );
}
