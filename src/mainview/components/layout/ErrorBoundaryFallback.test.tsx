// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundaryFallback } from './ErrorBoundaryFallback';

const invalidateMock = vi.fn();
const ErrorComponentMock = vi.fn(({ error }: { error: Error }) => (
  <div>dev:{error.message}</div>
));
vi.mock('@tanstack/react-router', () => ({
  ErrorComponent: (props: { error: Error }) => ErrorComponentMock(props),
  useRouter: () => ({ invalidate: invalidateMock }),
}));

describe('ErrorBoundaryFallback', () => {
  afterEach(() => {
    invalidateMock.mockReset();
    ErrorComponentMock.mockClear();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('delegates to the router error component in the current test environment', () => {
    render(<ErrorBoundaryFallback error={new Error('Boom')} reset={vi.fn()} />);

    expect(screen.getByText('dev:Boom')).toBeInTheDocument();
    expect(ErrorComponentMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) })
    );
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it('passes different error objects through to the router error component', () => {
    render(<ErrorBoundaryFallback error={new Error('Oops')} reset={vi.fn()} />);

    expect(screen.getByText('dev:Oops')).toBeInTheDocument();
    expect(ErrorComponentMock).toHaveBeenCalledTimes(1);
  });

  it('does not invoke reset handlers while rendering router errors', () => {
    const resetMock = vi.fn();

    render(
      <ErrorBoundaryFallback error={new Error('Still dev')} reset={resetMock} />
    );

    expect(screen.getByText('dev:Still dev')).toBeInTheDocument();
    expect(resetMock).not.toHaveBeenCalled();
    expect(invalidateMock).not.toHaveBeenCalled();
  });
});
