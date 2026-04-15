import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: toastError,
  },
}));

vi.mock('../../paraglide/messages.js', () => ({
  action_retry: () => 'Retry',
}));

beforeEach(() => {
  toastError.mockReset();
  vi.resetModules();
});

describe('queryClient', () => {
  it('configures queries with a 1 minute stale time', async () => {
    const { queryClient } = await import('@/lib/queryClient');

    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(60_000);
  });

  it('shows a retry toast when a query errors', async () => {
    const { queryClient } = await import('@/lib/queryClient');
    const invalidate = vi.fn();
    const error = new Error('request failed');

    const queryLike = { invalidate };

    queryClient
      .getQueryCache()
      .config.onError?.(error, queryLike as unknown as never);

    expect(toastError).toHaveBeenCalledTimes(1);
    const [message, options] = toastError.mock.calls[0]!;
    expect(message).toBe('Error: request failed');
    expect(options?.action?.label).toBe('Retry');

    options?.action?.onClick();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
