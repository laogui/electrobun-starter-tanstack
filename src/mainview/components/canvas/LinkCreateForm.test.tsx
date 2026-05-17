// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LinkCreateForm } from '@/components/canvas/LinkCreateForm';

describe('LinkCreateForm', () => {
  it('creates link node data and resets the input for valid URLs', () => {
    const onCreate = vi.fn();
    render(<LinkCreateForm onCreate={onCreate} />);

    const input = screen.getByLabelText('Link URL');
    const button = screen.getByRole('button', { name: 'Create link' });

    fireEvent.change(input, { target: { value: 'example.com/docs' } });
    fireEvent.click(button);

    expect(onCreate).toHaveBeenCalledWith({
      url: 'https://example.com/docs',
      title: 'example.com',
      color: '#FFFFFF',
    });
    expect((input as HTMLInputElement).value).toBe('');
    expect(
      screen.queryByText('Enter a valid http or https URL.')
    ).not.toBeInTheDocument();
  });

  it('shows validation error for invalid URLs and clears it on input change', () => {
    const onCreate = vi.fn();
    render(<LinkCreateForm onCreate={onCreate} />);

    const input = screen.getByLabelText('Link URL');
    const button = screen.getByRole('button', { name: 'Create link' });

    fireEvent.change(input, { target: { value: 'just words' } });
    fireEvent.click(button);

    expect(onCreate).not.toHaveBeenCalled();
    expect(
      screen.getByText('Enter a valid http or https URL.')
    ).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'https://example.com' } });

    expect(
      screen.queryByText('Enter a valid http or https URL.')
    ).not.toBeInTheDocument();
  });

  it('disables submit button for empty or whitespace input', () => {
    render(<LinkCreateForm onCreate={() => {}} />);

    const input = screen.getByLabelText('Link URL');
    const button = screen.getByRole('button', { name: 'Create link' });

    expect(button).toBeDisabled();

    fireEvent.change(input, { target: { value: '   ' } });
    expect(button).toBeDisabled();

    fireEvent.change(input, { target: { value: 'https://example.com' } });
    expect(button).not.toBeDisabled();
  });
});
