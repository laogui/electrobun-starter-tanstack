// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AssetHoverCard } from './AssetHoverCard';

describe('AssetHoverCard', () => {
  it('renders children directly when disabled (no trigger wiring)', () => {
    const { container } = render(
      <AssetHoverCard enabled={false} rows={[{ label: 'Type', value: 'PDF' }]}>
        <div data-testid="card">card</div>
      </AssetHoverCard>
    );
    expect(screen.getByTestId('card')).toBeInTheDocument();
    // No portal/popup content rendered when disabled.
    expect(container.querySelector('dl')).toBeNull();
  });

  it('renders children directly when there are no rows', () => {
    render(
      <AssetHoverCard rows={[]}>
        <div data-testid="card">card</div>
      </AssetHoverCard>
    );
    expect(screen.getByTestId('card')).toBeInTheDocument();
  });

  it('shows the metadata rows on hover', async () => {
    render(
      <AssetHoverCard
        rows={[
          { label: 'Type', value: 'PDF' },
          { label: 'Size', value: '2.0 KB' },
        ]}
      >
        <div data-testid="card">card</div>
      </AssetHoverCard>
    );

    // Trigger hover on the wrapping element.
    fireEvent.mouseEnter(screen.getByTestId('card').parentElement!);

    await waitFor(() => {
      expect(screen.getByText('PDF')).toBeInTheDocument();
      expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    });
  });
});
