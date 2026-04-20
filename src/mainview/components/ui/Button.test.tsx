// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button, buttonVariants } from './Button';

describe('Button', () => {
  it('applies variant and size contracts', () => {
    render(
      <Button size="sm" variant="outline">
        Action
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Action' });
    expect(button.className).toContain(
      buttonVariants({ size: 'sm', variant: 'outline' })
    );
  });

  it('supports disabled and click behavior', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button disabled={true} onClick={onClick}>
        Save
      </Button>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();

    rerender(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
