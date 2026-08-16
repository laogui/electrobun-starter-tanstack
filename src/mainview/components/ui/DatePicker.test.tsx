// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DatePicker } from './DatePicker';

describe('DatePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 12, 15, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a calendar popover and commits a selected day', () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        aria-label="Due date"
        onChange={onChange}
        value={new Date(2026, 6, 8, 20, 15)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Due date' }));
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();

    fireEvent.click(
      document.querySelector('button[data-day="2026-07-15"]') as Element
    );
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]?.[0] as Date;
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(6);
    expect(next.getDate()).toBe(15);
    expect(next.getHours()).toBe(20);
    expect(next.getMinutes()).toBe(15);
  });

  it('keeps the popover open and updates time when includeTime is set', () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        aria-label="Due date"
        includeTime
        onChange={onChange}
        value={new Date(2026, 6, 8, 20, 15)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Due date' }));
    fireEvent.change(screen.getByLabelText('Time'), {
      target: { value: '13:45' },
    });

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0]?.[0]).toEqual(new Date(2026, 6, 8, 13, 45));
    expect(screen.getByLabelText('Time')).toBeInTheDocument();
  });

  it('does not update month state when the same instant is passed as a new Date', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DatePicker
        aria-label="Due date"
        onChange={onChange}
        value={new Date(2026, 6, 8, 20, 15)}
      />
    );

    rerender(
      <DatePicker
        aria-label="Due date"
        onChange={onChange}
        value={new Date(2026, 6, 8, 20, 15)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Due date' }));
    expect(screen.getByText('July 2026')).toBeInTheDocument();
  });

  it('applies the today and tomorrow shortcuts', () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        aria-label="Due date"
        onChange={onChange}
        value={new Date(2026, 6, 1, 9, 0)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Due date' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    const tomorrow = onChange.mock.calls[0]?.[0] as Date;
    expect(tomorrow.getDate()).toBe(9);
    expect(tomorrow.getHours()).toBe(9);

    fireEvent.click(screen.getByRole('button', { name: 'Due date' }));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    const today = onChange.mock.calls[1]?.[0] as Date;
    expect(today.getDate()).toBe(8);
    expect(today.getHours()).toBe(9);
  });
});
