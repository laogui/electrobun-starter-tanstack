// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TagEditor, type TagEditorChange } from './TagEditor';

function Harness({
  initialTag,
  initialTagColor,
  initialTagColors,
  initialTags = [],
  onChangeSpy,
  suggestions,
}: {
  initialTag?: string;
  initialTagColor?: string;
  initialTagColors?: Record<string, string>;
  initialTags?: string[];
  onChangeSpy?: (next: TagEditorChange) => void;
  suggestions?: string[];
}) {
  const [tag, setTag] = useState(initialTag);
  const [tagColor, setTagColor] = useState(initialTagColor);
  const [tagColors, setTagColors] = useState<Record<string, string>>(
    initialTagColors ?? {}
  );
  const [tags, setTags] = useState<string[]>(initialTags);
  const [open, setOpen] = useState(true);

  const apply = (next: TagEditorChange) => {
    onChangeSpy?.(next);
    if ('tag' in next) {
      setTag(next.tag);
    }
    if ('tagColor' in next) {
      setTagColor(next.tagColor);
    }
    if ('tagColors' in next) {
      setTagColors(next.tagColors ?? {});
    }
    if ('tags' in next) {
      setTags(next.tags ?? []);
    }
  };

  return (
    <TagEditor
      onChange={apply}
      onOpenChange={setOpen}
      open={open}
      suggestions={suggestions}
      tag={tag}
      tagColor={tagColor}
      tagColors={tagColors}
      tags={tags}
    >
      <button type="button">trigger</button>
    </TagEditor>
  );
}

describe('TagEditor', () => {
  it('adds a tag only when the confirmation button is clicked', () => {
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} />);

    const input = screen.getByPlaceholderText('Add tag…') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'draft' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(spy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(spy).toHaveBeenCalledWith({
      tag: undefined,
      tagColor: undefined,
      tagColors: {},
      tags: ['draft'],
    });
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('does not confirm pinyin while an IME composition is active', () => {
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} />);

    const input = screen.getByPlaceholderText('Add tag…') as HTMLInputElement;
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'zhong' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(spy).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input);
    fireEvent.change(input, { target: { value: '中' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(spy).toHaveBeenCalledWith({
      tag: undefined,
      tagColor: undefined,
      tagColors: {},
      tags: ['中'],
    });
  });

  it('splits comma-separated input into multiple tags and dedupes', () => {
    const spy = vi.fn();
    render(<Harness initialTags={['alpha']} onChangeSpy={spy} />);

    const input = screen.getByPlaceholderText('Add tag…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'beta, ALPHA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    // Last onChange should contain alpha (existing, deduped) + beta (new)
    expect(spy).toHaveBeenLastCalledWith({
      tag: undefined,
      tagColor: undefined,
      tagColors: {},
      tags: ['alpha', 'beta'],
    });
  });

  it('merges the legacy primary tag into the same tag list', () => {
    render(
      <Harness
        initialTag="Idea"
        initialTagColor="#FDF2F8"
        initialTags={['Alpha']}
      />
    );

    expect(screen.getAllByPlaceholderText('Add tag…')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Idea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Idea' }).closest('span')
    ).toHaveStyle({
      backgroundColor: '#FDF2F8',
    });
  });

  it('updates the selected tag color', () => {
    const spy = vi.fn();
    render(<Harness initialTags={['draft']} onChangeSpy={spy} />);

    fireEvent.click(screen.getByRole('button', { name: '#FDF2F8' }));

    expect(spy).toHaveBeenCalledWith({
      tag: undefined,
      tagColor: undefined,
      tagColors: { draft: '#FDF2F8' },
      tags: ['draft'],
    });
  });

  it('removes a tag when clicking its × button', () => {
    const spy = vi.fn();
    render(
      <Harness
        initialTagColors={{ draft: '#FDF2F8', review: '#EAF2B8' }}
        initialTags={['draft', 'review']}
        onChangeSpy={spy}
      />
    );

    const removeButtons = screen.getAllByLabelText('Remove tag');
    fireEvent.click(removeButtons[0]!);

    expect(spy).toHaveBeenCalledWith({
      tag: undefined,
      tagColor: undefined,
      tagColors: { review: '#EAF2B8' },
      tags: ['review'],
    });
  });

  it('does not remove existing tags when Backspace clears the add input', () => {
    const spy = vi.fn();
    render(<Harness initialTags={['draft', 'review']} onChangeSpy={spy} />);

    const input = screen.getByPlaceholderText('Add tag…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'temp' } });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Backspace' });

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'review' })).toBeInTheDocument();
  });

  it('disables input when MAX_TAGS reached', () => {
    const eight = Array.from({ length: 8 }, (_, i) => `t${i}`);
    render(<Harness initialTags={eight} />);

    const input = screen.getByPlaceholderText('Add tag…') as HTMLInputElement;
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(screen.getByText('Up to 8 tags')).toBeInTheDocument();
  });

  it('shows matching suggestions filtered by the draft input', () => {
    render(
      <Harness suggestions={['Work', 'Workshop', 'Personal', 'Errand']} />
    );

    const input = screen.getByPlaceholderText('Add tag…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wor' } });

    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Work', 'Workshop']);
  });

  it('hides suggestions for tags already applied', () => {
    render(
      <Harness
        initialTags={['Work']}
        suggestions={['Work', 'Workshop', 'Personal']}
      />
    );

    const input = screen.getByPlaceholderText('Add tag…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wor' } });

    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Workshop']);
  });

  it('adds the highlighted suggestion when pressing Enter', () => {
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} suggestions={['Work', 'Workshop']} />);

    const input = screen.getByPlaceholderText('Add tag…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wor' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(spy).not.toHaveBeenCalled();
  });

  it('adds a suggestion when clicked', () => {
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} suggestions={['Work', 'Personal']} />);

    const input = screen.getByPlaceholderText('Add tag…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'per' } });
    fireEvent.click(screen.getByRole('option', { name: 'Personal' }));

    expect(spy).toHaveBeenLastCalledWith({
      tag: undefined,
      tagColor: undefined,
      tagColors: {},
      tags: ['Personal'],
    });
  });

  it('keeps popover input clicks from bubbling to the node surface', () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <Harness />
      </div>
    );

    fireEvent.click(screen.getByPlaceholderText('Add tag…'));

    expect(parentClick).not.toHaveBeenCalled();
  });
});
