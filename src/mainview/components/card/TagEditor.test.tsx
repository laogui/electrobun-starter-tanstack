// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TagEditor, type TagEditorChange } from './TagEditor';

function Harness({
  initialTag,
  initialTagColor,
  initialTags = [],
  onChangeSpy,
}: {
  initialTag?: string;
  initialTagColor?: string;
  initialTags?: string[];
  onChangeSpy?: (next: TagEditorChange) => void;
}) {
  const [tag, setTag] = useState(initialTag);
  const [tagColor, setTagColor] = useState(initialTagColor);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [open, setOpen] = useState(true);

  const apply = (next: TagEditorChange) => {
    onChangeSpy?.(next);
    if (next.tag !== undefined) {
      setTag(next.tag);
    }
    if (next.tagColor !== undefined) {
      setTagColor(next.tagColor);
    }
    if (next.tags !== undefined) {
      setTags(next.tags);
    }
  };

  return (
    <TagEditor
      onChange={apply}
      onOpenChange={setOpen}
      open={open}
      tag={tag}
      tagColor={tagColor}
      tags={tags}
    >
      <button type="button">trigger</button>
    </TagEditor>
  );
}

describe('TagEditor', () => {
  it('adds a tag when pressing Enter', () => {
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} />);

    // The first input is the primary tag; the second is the multi-tags input.
    const multiInput = screen.getAllByPlaceholderText(
      'Add tag…'
    )[1] as HTMLInputElement;

    fireEvent.change(multiInput, { target: { value: 'draft' } });
    fireEvent.keyDown(multiInput, { key: 'Enter' });

    expect(spy).toHaveBeenCalledWith({ tags: ['draft'] });
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('splits comma-separated input into multiple tags and dedupes', () => {
    const spy = vi.fn();
    render(<Harness initialTags={['alpha']} onChangeSpy={spy} />);

    const multiInput = screen.getAllByPlaceholderText(
      'Add tag…'
    )[1] as HTMLInputElement;
    fireEvent.change(multiInput, { target: { value: 'beta, ALPHA' } });
    fireEvent.keyDown(multiInput, { key: 'Enter' });

    // Last onChange should contain alpha (existing, deduped) + beta (new)
    expect(spy).toHaveBeenLastCalledWith({ tags: ['alpha', 'beta'] });
  });

  it('removes a tag when clicking its × button', () => {
    const spy = vi.fn();
    render(<Harness initialTags={['draft', 'review']} onChangeSpy={spy} />);

    const removeButtons = screen.getAllByLabelText('Remove tag');
    fireEvent.click(removeButtons[0]!);

    expect(spy).toHaveBeenCalledWith({ tags: ['review'] });
  });

  it('removes the last tag on Backspace when input is empty', () => {
    const spy = vi.fn();
    render(<Harness initialTags={['draft', 'review']} onChangeSpy={spy} />);

    const multiInput = screen.getAllByPlaceholderText(
      'Add tag…'
    )[1] as HTMLInputElement;
    fireEvent.keyDown(multiInput, { key: 'Backspace' });

    expect(spy).toHaveBeenCalledWith({ tags: ['draft'] });
  });

  it('updates the primary tag and color', () => {
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} />);

    const primaryInput = screen.getAllByPlaceholderText(
      'Add tag…'
    )[0] as HTMLInputElement;
    fireEvent.change(primaryInput, { target: { value: 'urgent' } });
    expect(spy).toHaveBeenCalledWith({ tag: 'urgent' });

    // Pick the second color swatch (index 1) — buttons have aria-label = hex value.
    const swatch = screen.getByLabelText('#FDF2F8');
    fireEvent.click(swatch);
    expect(spy).toHaveBeenCalledWith({ tagColor: '#FDF2F8' });
  });

  it('disables input when MAX_TAGS reached', () => {
    const eight = Array.from({ length: 8 }, (_, i) => `t${i}`);
    render(<Harness initialTags={eight} />);

    const multiInput = screen.getAllByPlaceholderText(
      'Add tag…'
    )[1] as HTMLInputElement;
    expect(multiInput).toBeDisabled();
    expect(screen.getByText('Up to 8 tags')).toBeInTheDocument();
  });
});
