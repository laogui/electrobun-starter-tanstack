import type { ErrorComponentProps } from '@tanstack/react-router';
import { ErrorComponent, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { reportRendererError } from '@/lib/diagnostics';
import * as m from '../../../paraglide/messages.js';

export function ErrorBoundaryFallback({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    reportRendererError(error);
  }, [error]);

  if (import.meta.env.DEV) {
    return <ErrorComponent error={error} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div>{m.error_generic()}</div>
      <button
        onClick={() => {
          reset();
          router.invalidate();
        }}
        type="button"
      >
        {m.action_reset()}
      </button>
    </div>
  );
}
