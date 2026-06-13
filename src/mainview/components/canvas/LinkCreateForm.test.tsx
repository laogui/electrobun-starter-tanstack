// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LinkCreateForm } from '@/components/canvas/LinkCreateForm';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LinkCreateForm', () => {
  it('does not read the clipboard when the form opens', async () => {
    const readText = vi.fn().mockResolvedValue('https://example.com');
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      clipboard: { readText },
    });

    render(<LinkCreateForm onCreate={() => {}} />);

    await act(async () => {});

    expect(readText).not.toHaveBeenCalled();
  });

  it('creates link node data and resets the input for valid URLs', async () => {
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
    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('');
    });
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

  it('shows a loading state while the create handler is pending', async () => {
    let resolveCreate: (() => void) | undefined;
    const onCreate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        })
    );
    render(<LinkCreateForm onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText('Link URL'), {
      target: { value: 'https://example.com/docs' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

    const busyButton = screen.getByRole('button', { name: 'Creating link' });
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      resolveCreate?.();
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Create link' })
      ).toHaveAttribute('aria-busy', 'false');
    });
  });
});
