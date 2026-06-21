// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TypeBadge } from './TypeBadge';

describe('TypeBadge', () => {
  it('renders the label text in uppercase', () => {
    render(<TypeBadge>Video</TypeBadge>);
    expect(screen.getByText('Video')).toBeInTheDocument();
  });

  it('applies the missing variant styling', () => {
    render(<TypeBadge missing>Missing</TypeBadge>);
    const badge = screen.getByText('Missing');
    expect(badge.className).toContain('text-red-700');
  });

  it('uses the neutral variant by default', () => {
    render(<TypeBadge>PDF</TypeBadge>);
    const badge = screen.getByText('PDF');
    expect(badge.className).toContain('text-neutral-500');
    expect(badge.className).not.toContain('text-red-700');
  });
});
