import { Check, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { NodeTagChips } from '@/components/card/NodeTagChips';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';

import type { CardContentData, ChecklistItem } from './nodes/CardNode';

interface ChecklistFocusedViewProps {
  data: CardContentData;
  onCommit: (updates: Partial<CardContentData>) => void;
}

interface ItemRowProps {
  inputRef: (el: HTMLInputElement | null) => void;
  isDark: boolean;
  item: ChecklistItem;
  onDelete: () => void;
  onDeleteEmptyBackwards: () => void;
  onEnter: (text: string) => void;
  onTextCommit: (text: string) => void;
  onToggle: () => void;
}

const ItemRow = ({
  inputRef,
  isDark,
  item,
  onDelete,
  onDeleteEmptyBackwards,
  onEnter,
  onTextCommit,
  onToggle,
}: ItemRowProps) => {
  const [text, setText] = useState(item.text ?? '');

  const commitIfChanged = useCallback(() => {
    if (text !== (item.text ?? '')) {
      onTextCommit(text);
    }
  }, [item.text, onTextCommit, text]);

  if (item.isHeader) {
    return (
      <div className="group flex items-center gap-3 pt-6 pb-1">
        <input
          aria-label="Section title"
          className={cn(
            'w-full border-none bg-transparent font-semibold text-sm uppercase tracking-wide outline-hidden',
            isDark
              ? 'text-white/70 placeholder-white/30'
              : 'text-neutral-500 placeholder-neutral-300'
          )}
          onBlur={commitIfChanged}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onEnter(text);
            } else if (e.key === 'Backspace' && text === '') {
              e.preventDefault();
              onDeleteEmptyBackwards();
            }
          }}
          placeholder="Section"
          ref={inputRef}
          value={text}
        />
        <button
          aria-label="Delete section"
          className={cn(
            'hover:!opacity-100 shrink-0 rounded-md p-1 opacity-0 transition-opacity group-focus-within:opacity-60 group-hover:opacity-60',
            isDark ? 'text-white' : 'text-neutral-500'
          )}
          onClick={onDelete}
          tabIndex={-1}
          type="button"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3.5 py-1.5">
      <button
        aria-label={item.checked ? 'Mark as not done' : 'Mark as done'}
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
          item.checked
            ? isDark
              ? 'border-white bg-white'
              : 'border-neutral-900 bg-neutral-900'
            : isDark
              ? 'border-white/35 hover:border-white'
              : 'border-neutral-300 hover:border-neutral-900'
        )}
        onClick={onToggle}
        type="button"
      >
        {item.checked ? (
          <Check
            className={isDark ? 'text-black' : 'text-white'}
            size={13}
            strokeWidth={3}
          />
        ) : null}
      </button>
      <input
        aria-label="Checklist item text"
        className={cn(
          'w-full border-none bg-transparent text-base outline-hidden transition-colors',
          item.checked
            ? isDark
              ? 'text-white/45 line-through'
              : 'text-neutral-400 line-through'
            : isDark
              ? 'text-white/95 placeholder-white/30'
              : 'text-neutral-800 placeholder-neutral-300'
        )}
        onBlur={commitIfChanged}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter(text);
          } else if (e.key === 'Backspace' && text === '') {
            e.preventDefault();
            onDeleteEmptyBackwards();
          }
        }}
        placeholder="To-do"
        ref={inputRef}
        value={text}
      />
      <button
        aria-label="Delete item"
        className={cn(
          'hover:!opacity-100 shrink-0 rounded-md p-1 opacity-0 transition-opacity group-focus-within:opacity-60 group-hover:opacity-60',
          isDark ? 'text-white' : 'text-neutral-500'
        )}
        onClick={onDelete}
        tabIndex={-1}
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
};

const checklistFocusedItemKey = (item: ChecklistItem) =>
  `${item.isHeader ? 'header' : 'item'}:${item.text ?? ''}:${
    item.checked ? 'checked' : 'unchecked'
  }`;

export const ChecklistFocusedView = ({
  data,
  onCommit,
}: ChecklistFocusedViewProps) => {
  const isDark = isColorDark(data.color);
  const items = useMemo(() => data.items ?? [], [data.items]);
  const [newItem, setNewItem] = useState('');
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pendingFocusIndex = useRef<number | null>(null);

  const tasks = items.filter((item) => !item.isHeader);
  const doneCount = tasks.filter((item) => item.checked).length;
  const progress = tasks.length > 0 ? doneCount / tasks.length : 0;

  // Focus the row queued by an Enter-insert / Backspace-delete after the
  // committed items have re-rendered.
  useEffect(() => {
    if (pendingFocusIndex.current == null) {
      return;
    }
    const el = inputRefs.current[pendingFocusIndex.current];
    pendingFocusIndex.current = null;
    el?.focus();
  });

  const commitItems = useCallback(
    (next: ChecklistItem[]) => {
      onCommit({ items: next });
    },
    [onCommit]
  );

  const handleToggle = useCallback(
    (index: number) => {
      commitItems(
        items.map((item, i) =>
          i === index ? { ...item, checked: !item.checked } : item
        )
      );
    },
    [commitItems, items]
  );

  const handleTextCommit = useCallback(
    (index: number, text: string) => {
      commitItems(
        items.map((item, i) => (i === index ? { ...item, text } : item))
      );
    },
    [commitItems, items]
  );

  const handleEnter = useCallback(
    (index: number, text: string) => {
      const next = items.map((item, i) =>
        i === index ? { ...item, text } : item
      );
      next.splice(index + 1, 0, { text: '', checked: false });
      pendingFocusIndex.current = index + 1;
      commitItems(next);
    },
    [commitItems, items]
  );

  const handleDelete = useCallback(
    (index: number, refocus: boolean) => {
      if (refocus) {
        pendingFocusIndex.current = Math.max(0, index - 1);
      }
      commitItems(items.filter((_, i) => i !== index));
    },
    [commitItems, items]
  );

  const handleAddItem = useCallback(() => {
    const text = newItem.trim();
    if (!text) {
      return;
    }
    commitItems([...items, { text, checked: false }]);
    setNewItem('');
  }, [commitItems, items, newItem]);

  return (
    <div
      className={cn(
        'size-full overflow-y-auto bg-white dark:bg-zinc-950',
        isDark && 'text-white'
      )}
      style={colorToStyle(data.color)}
    >
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-8 pt-24 pb-32">
        <NodeTagChips
          className="mb-4"
          isDark={isDark}
          tag={data.tag}
          tagColor={data.tagColor}
          tagColors={data.tagColors}
          tags={data.tags}
        />

        <input
          aria-label="Checklist title"
          className={cn(
            'w-full border-none bg-transparent font-bold text-4xl leading-tight tracking-tight outline-hidden',
            isDark ? 'placeholder-white/30' : 'placeholder-neutral-300'
          )}
          defaultValue={data.title ?? ''}
          key={data.title ?? ''}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== (data.title ?? '')) {
              onCommit({ title: next });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder="Untitled checklist"
        />

        {tasks.length > 0 ? (
          <div className="mt-5 flex items-center gap-3">
            <div
              className={cn(
                'h-1.5 w-full max-w-56 overflow-hidden rounded-full',
                isDark ? 'bg-white/15' : 'bg-black/8'
              )}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-300',
                  isDark ? 'bg-white' : 'bg-neutral-900'
                )}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <span
              className={cn(
                'font-medium text-xs tabular-nums',
                isDark ? 'text-white/60' : 'text-neutral-400'
              )}
            >
              {doneCount}/{tasks.length}
            </span>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col">
          {items.map((item, index) => (
            <ItemRow
              inputRef={(el) => {
                inputRefs.current[index] = el;
              }}
              isDark={isDark}
              item={item}
              // Text is part of the key so a committed rename remounts the row
              // with fresh local state; while typing nothing commits, so the
              // row is stable and the caret is preserved.
              key={checklistFocusedItemKey(item)}
              onDelete={() => handleDelete(index, false)}
              onDeleteEmptyBackwards={() => handleDelete(index, true)}
              onEnter={(text) => handleEnter(index, text)}
              onTextCommit={(text) => handleTextCommit(index, text)}
              onToggle={() => handleToggle(index)}
            />
          ))}

          <div
            className={cn(
              'flex items-center gap-3.5 py-1.5 transition-opacity',
              newItem ? 'opacity-100' : 'opacity-45 focus-within:opacity-100'
            )}
          >
            <div
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-md border border-dashed',
                isDark ? 'border-white/35' : 'border-neutral-300'
              )}
            >
              <Plus
                className={isDark ? 'text-white/50' : 'text-neutral-400'}
                size={13}
              />
            </div>
            <input
              aria-label="New checklist item"
              className={cn(
                'w-full border-none bg-transparent text-base outline-hidden',
                isDark ? 'placeholder-white/40' : 'placeholder-neutral-400'
              )}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddItem();
                }
              }}
              placeholder="Add item..."
              type="text"
              value={newItem}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
