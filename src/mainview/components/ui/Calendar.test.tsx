// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Calendar } from './Calendar';

describe('Calendar', () => {
  it('renders the visible month and reports a selected day', () => {
    const onSelect = vi.fn();
    render(
      <Calendar
        defaultMonth={new Date(2026, 6, 8)}
        mode="single"
        onSelect={onSelect}
        selected={new Date(2026, 6, 8)}
      />
    );

    expect(screen.getByText('July 2026')).toBeInTheDocument();
    const fifteenth = document.querySelector('button[data-day="2026-07-15"]');
    expect(fifteenth).not.toBeNull();
    fireEvent.click(fifteenth as Element);
    expect(onSelect).toHaveBeenCalled();
    const selected = onSelect.mock.calls[0]?.[0] as Date;
    expect(selected.getFullYear()).toBe(2026);
    expect(selected.getMonth()).toBe(6);
    expect(selected.getDate()).toBe(15);
  });
});
