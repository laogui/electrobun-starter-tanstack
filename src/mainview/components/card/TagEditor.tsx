import { Popover } from '@base-ui/react/popover';
import { Check, X } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { CARD_COLORS, colorToStyle } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';

import * as m from '../../../paraglide/messages.js';

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 32;

export interface TagEditorChange {
  tag?: string;
  tagColor?: string;
  tags?: string[];
}

interface TagEditorProps {
  /** Trigger element rendered as `<Popover.Trigger render={...}>`. */
  children: ReactNode;
  onChange: (next: TagEditorChange) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  tag?: string;
  tagColor?: string;
  tags?: string[];
}

function dedupePush(list: string[], value: string): string[] {
  const trimmed = value.trim().slice(0, MAX_TAG_LENGTH);
  if (!trimmed) {
    return list;
  }
  const key = trimmed.toLowerCase();
  if (list.some((t) => t.toLowerCase() === key)) {
    return list;
  }
  if (list.length >= MAX_TAGS) {
    return list;
  }
  return [...list, trimmed];
}

export function TagEditor({
  children,
  onChange,
  onOpenChange,
  open,
  tag,
  tagColor,
  tags,
}: TagEditorProps) {
  const safeTags = tags ?? [];
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const limitReached = safeTags.length >= MAX_TAGS;

  useEffect(() => {
    if (open) {
      // Defer to next tick so the popup is mounted before we focus.
      const handle = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => {
        window.clearTimeout(handle);
      };
    }
    setDraft('');
  }, [open]);

  const commitDraft = () => {
    const parts = draft
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      return;
    }
    let next = safeTags;
    for (const part of parts) {
      next = dedupePush(next, part);
    }
    if (next !== safeTags) {
      onChange({ tags: next });
    }
    setDraft('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitDraft();
      return;
    }
    if (e.key === 'Backspace' && !draft && safeTags.length > 0) {
      e.preventDefault();
      onChange({ tags: safeTags.slice(0, -1) });
    }
  };

  const removeTag = (value: string) => {
    onChange({ tags: safeTags.filter((t) => t !== value) });
  };

  return (
    <Popover.Root onOpenChange={onOpenChange} open={open}>
      <Popover.Trigger render={children as any} />
      <Popover.Portal>
        <Popover.Positioner side="bottom" sideOffset={6}>
          <Popover.Popup className="z-50 w-72 origin-(--transform-origin) rounded-lg border border-black/5 bg-white p-3 text-sm shadow-xl outline-none dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-100">
            <PrimaryTagRow onChange={onChange} tag={tag} tagColor={tagColor} />
            <div className="my-2 h-px bg-black/5 dark:bg-white/10" />
            <div className="flex flex-wrap gap-1.5">
              {safeTags.map((value) => (
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-neutral-700 text-xs dark:bg-neutral-700 dark:text-neutral-200"
                  key={value}
                >
                  {value}
                  <button
                    aria-label={m.tag_editor_remove()}
                    className="rounded-sm p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                    onClick={() => removeTag(value)}
                    type="button"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <input
              className={cn(
                'mt-2 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-neutral-900 dark:focus:border-white/30',
                limitReached && 'cursor-not-allowed opacity-50'
              )}
              disabled={limitReached}
              onBlur={commitDraft}
              onChange={(e) => {
                setDraft(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder={m.tag_editor_placeholder()}
              ref={inputRef}
              type="text"
              value={draft}
            />
            {limitReached ? (
              <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                {m.tag_limit_reached()}
              </p>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface PrimaryTagRowProps {
  onChange: (next: TagEditorChange) => void;
  tag?: string;
  tagColor?: string;
}

function PrimaryTagRow({ onChange, tag, tagColor }: PrimaryTagRowProps) {
  return (
    <div className="space-y-1.5">
      <input
        className="w-full rounded-md border border-black/10 bg-white px-2 py-1.5 font-semibold text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-neutral-900 dark:focus:border-white/30"
        maxLength={MAX_TAG_LENGTH}
        onChange={(e) => {
          onChange({ tag: e.target.value.slice(0, MAX_TAG_LENGTH) });
        }}
        placeholder={m.tag_editor_placeholder()}
        type="text"
        value={tag ?? ''}
      />
      <div className="flex items-center gap-1.5">
        {CARD_COLORS.map((color) => {
          const selected = tagColor === color;
          return (
            <button
              aria-label={color}
              className={cn(
                'flex size-5 items-center justify-center rounded-full border border-black/10 transition-transform hover:scale-110 dark:border-white/15',
                selected && 'ring-2 ring-blue-500 ring-offset-1'
              )}
              key={color}
              onClick={() => {
                onChange({ tagColor: color });
              }}
              style={colorToStyle(color)}
              type="button"
            >
              {selected ? (
                <Check className="text-neutral-700" size={10} />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
