// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NotePreview } from './NotePreview';

describe('NotePreview', () => {
  it('sanitizes stored preview html before rendering', () => {
    const { container } = render(
      <NotePreview
        html={[
          '<p>Safe preview</p>',
          '<img src="https://example.com/image.png" onerror="alert(1)">',
          '<script>alert(1)</script>',
        ].join('')}
      />
    );

    expect(screen.getByText('Safe preview')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('onerror')).toBeNull();
  });

  it('falls back to plain text when preview html is absent', () => {
    render(<NotePreview fallback="Plain body" />);

    expect(screen.getByText('Plain body')).toBeInTheDocument();
  });

  it('renders markdown from fallback content before stored preview exists', () => {
    const { container } = render(
      <NotePreview fallback={'# Heading\n\n- [x] Done'} />
    );

    expect(
      screen.getByRole('heading', { name: 'Heading' })
    ).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(container.querySelector('.note-checkbox-checked')).not.toBeNull();
  });
});
