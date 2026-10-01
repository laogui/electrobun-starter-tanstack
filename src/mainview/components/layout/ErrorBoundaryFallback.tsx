import type { ErrorComponentProps } from '@tanstack/react-router';
import { ErrorComponent, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { reportRendererError } from '@/lib/diagnostics';

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
      <div>Error</div>
      <button
        onClick={() => {
          reset();
          router.invalidate();
        }}
        type="button"
      >
        Reset
      </button>
    </div>
  );
}
