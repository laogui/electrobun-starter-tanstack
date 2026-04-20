// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Loader } from './Loader';

describe('Loader', () => {
  it('renders the loading spinner container', () => {
    const { container } = render(<Loader />);

    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(container.firstChild).toHaveClass(
      'flex',
      'items-center',
      'justify-center'
    );
  });
});
