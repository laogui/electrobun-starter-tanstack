// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LicenseStatusBadge, LicenseStatusCard } from './LicenseStatusCard';

const refreshLicenseMock = vi.fn();

vi.mock('@/lib/rpc-license', () => ({
  refreshLicense: () => refreshLicenseMock(),
}));

function renderWithQueryClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('LicenseStatusCard', () => {
  beforeEach(() => {
    refreshLicenseMock.mockReset();
  });

  it('renders the active license state after loading', async () => {
    refreshLicenseMock.mockResolvedValue({
      activated: true,
      activatedAt: '2026-06-01T00:00:00.000Z',
    });

    renderWithQueryClient(<LicenseStatusCard onActivateClick={vi.fn()} />);

    expect(await screen.findByText('Pro License Active')).toBeInTheDocument();
    await waitFor(() => {
      expect(refreshLicenseMock).toHaveBeenCalledTimes(1);
    });
  });

  it('renders the free state and activation action when not activated', async () => {
    const onActivateClick = vi.fn();
    refreshLicenseMock.mockResolvedValue({ activated: false });

    renderWithQueryClient(
      <LicenseStatusCard onActivateClick={onActivateClick} />
    );

    const activate = await screen.findByRole('button', {
      name: 'Activate Pro License',
    });
    fireEvent.click(activate);

    expect(onActivateClick).toHaveBeenCalledTimes(1);
  });
});

describe('LicenseStatusBadge', () => {
  beforeEach(() => {
    refreshLicenseMock.mockReset();
  });

  it('renders the Pro badge when activated', async () => {
    refreshLicenseMock.mockResolvedValue({ activated: true });

    renderWithQueryClient(<LicenseStatusBadge />);

    expect(await screen.findByText('Pro')).toBeInTheDocument();
  });

  it('renders the free badge when not activated', async () => {
    refreshLicenseMock.mockResolvedValue({ activated: false });

    renderWithQueryClient(<LicenseStatusBadge />);

    expect(await screen.findByText('Free (100 cards max)')).toBeInTheDocument();
  });
});
