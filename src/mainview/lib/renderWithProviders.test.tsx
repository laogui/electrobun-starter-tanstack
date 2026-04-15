// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test/renderWithProviders';

describe('renderWithProviders', () => {
  it('renders ui with a query client provider wrapper', () => {
    renderWithProviders(<div>Hello tests</div>);

    expect(screen.getByText('Hello tests')).toBeInTheDocument();
  });
});
