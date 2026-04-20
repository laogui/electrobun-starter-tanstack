// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Toaster } from './Toaster';

const sonnerMock = vi.fn(
  ({ className, icons, theme, toastOptions }: Record<string, unknown>) => (
    <div data-testid="sonner-root">
      <span>{String(className)}</span>
      <span>{String(theme)}</span>
      <span>
        {String(
          (toastOptions as { classNames?: { toast?: string } }).classNames
            ?.toast
        )}
      </span>
      <span>{icons ? Object.keys(icons as object).join(',') : ''}</span>
    </div>
  )
);

vi.mock('sonner', () => ({
  Toaster: (props: Record<string, unknown>) => sonnerMock(props),
}));

describe('Toaster', () => {
  it('mounts Sonner with the shared icon and option contract', () => {
    render(<Toaster richColors={true} />);

    expect(screen.getByTestId('sonner-root')).toBeInTheDocument();
    expect(screen.getByText('group')).toBeInTheDocument();
    expect(screen.getByText('system')).toBeInTheDocument();
    expect(screen.getByText('cn-toast')).toBeInTheDocument();
    expect(
      screen.getByText('success,info,warning,error,loading')
    ).toBeInTheDocument();
  });
});
