import { Popover } from '@base-ui/react/popover';
import { Check, X } from 'lucide-react';
import type { KeyboardEvent, ReactNode, SyntheticEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { CARD_COLORS, colorToStyle } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';

import * as m from '../../../paraglide/messages.js';

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 32;

export interface TagEditorChange {
  tag?: string;
  tagColor?: string;
  tagColors?: Record<string, string>;
  tags?: string[];
}

interface TagEditorProps {
  /** Trigger element rendered as `<Popover.Trigger render={...}>`. */
  children: ReactNode;
  onChange: (next: TagEditorChange) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Workspace-wide tag names used to populate the autocomplete dropdown. */
  suggestions?: string[];
  tag?: string;
  tagColor?: string;
  tagColors?: Record<string, string>;
  tags?: string[];
}

const MAX_VISIBLE_SUGGESTIONS = 6;

function filterSuggestions(
  pool: string[],
  draft: string,
  exclude: string[]
): string[] {
  const needle = draft.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const excluded = new Set(exclude.map((t) => t.toLowerCase()));
  const out: string[] = [];
  for (const name of pool) {
    const lower = name.toLowerCase();
    if (excluded.has(lower)) {
      continue;
    }
    if (!lower.includes(needle)) {
      continue;
    }
    out.push(name);
    if (out.length >= MAX_VISIBLE_SUGGESTIONS) {
      break;
    }
  }
  return out;
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

function mergeTagNames(tag: string | undefined, tags: string[] | undefined) {
  let out: string[] = [];
  if (tag) {
    out = dedupePush(out, tag);
  }
  for (const value of tags ?? []) {
    out = dedupePush(out, value);
  }
  return out;
}

function colorForTag(
  tagColors: Record<string, string> | undefined,
  name: string
): string | undefined {
  const key = name.toLowerCase();
  return Object.entries(tagColors ?? {}).find(
    ([tagName]) => tagName.toLowerCase() === key
  )?.[1];
}

function buildTagColorMap({
  tag,
  tagColor,
  tagColors,
  tags,
}: {
  tag?: string;
  tagColor?: string;
  tagColors?: Record<string, string>;
  tags: string[];
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of tags) {
    const color = colorForTag(tagColors, name);
    if (color) {
      out[name] = color;
    }
  }
  if (tag && tagColor) {
    const canonical = tags.find(
      (name) => name.toLowerCase() === tag.toLowerCase()
    );
    if (canonical) {
      out[canonical] = tagColor;
    }
  }
  return out;
}

function pruneTagColorMap(
  tagColors: Record<string, string>,
  tags: string[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of tags) {
    const color = colorForTag(tagColors, name);
    if (color) {
      out[name] = color;
    }
  }
  return out;
}

function sameTagNames(a: string[], b: string[]) {
  return (
    a.length === b.length &&
    a.every((value, index) => value.toLowerCase() === b[index]?.toLowerCase())
  );
}

function sameTagColors(a: Record<string, string>, b: Record<string, string>) {
  const aEntries = Object.entries(a);
  const bEntries = Object.entries(b);
  return (
    aEntries.length === bEntries.length &&
    aEntries.every(([key, value]) => b[key] === value)
  );
}

function stopPopoverEvent(e: SyntheticEvent) {
  e.stopPropagation();
}

export function TagEditor({
  children,
  onChange,
  onOpenChange,
  open,
  suggestions,
  tag,
  tagColor,
  tagColors,
  tags,
}: TagEditorProps) {
  const safeTags = useMemo(() => mergeTagNames(tag, tags), [tag, tags]);
  const safeTagColors = useMemo(
    () => buildTagColorMap({ tag, tagColor, tagColors, tags: safeTags }),
    [tag, tagColor, tagColors, safeTags]
  );
  const [draft, setDraft] = useState('');
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [selectedTag, setSelectedTag] = useState<string | null>(
    () => safeTags[0] ?? null
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const limitReached = safeTags.length >= MAX_TAGS;
  const canCommitDraft = draft.trim().length > 0 && !limitReached;

  const filteredSuggestions = useMemo(
    () => filterSuggestions(suggestions ?? [], draft, safeTags),
    [suggestions, draft, safeTags]
  );

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
    setActiveSuggestion(0);
  }, [open]);

  useEffect(() => {
    if (safeTags.length === 0) {
      if (selectedTag !== null) {
        setSelectedTag(null);
      }
      return;
    }
    if (!(selectedTag && safeTags.some((t) => t === selectedTag))) {
      setSelectedTag(safeTags[0] ?? null);
    }
  }, [safeTags, selectedTag]);

  const commitTags = (nextTags: string[], nextColors = safeTagColors): void => {
    const prunedColors = pruneTagColorMap(nextColors, nextTags);
    if (
      sameTagNames(safeTags, nextTags) &&
      sameTagColors(safeTagColors, prunedColors) &&
      !tag &&
      !tagColor
    ) {
      return;
    }
    onChange({
      tag: undefined,
      tagColor: undefined,
      tagColors: prunedColors,
      tags: nextTags,
    });
  };

  const addTagValue = (value: string) => {
    const next = dedupePush(safeTags, value);
    if (!sameTagNames(next, safeTags)) {
      commitTags(next);
      setSelectedTag(next.at(-1) ?? null);
    }
    setDraft('');
    setActiveSuggestion(0);
  };

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
    if (!sameTagNames(next, safeTags)) {
      commitTags(next);
      setSelectedTag(next.at(-1) ?? null);
    }
    setDraft('');
    setActiveSuggestion(0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const isComposing = composingRef.current || e.nativeEvent.isComposing;
    if (isComposing) {
      return;
    }
    if (filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestion((prev) => (prev + 1) % filteredSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestion(
          (prev) =>
            (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length
        );
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && filteredSuggestions.length > 0) {
      e.preventDefault();
      setDraft('');
      setActiveSuggestion(0);
      return;
    }
  };

  const removeTag = (value: string) => {
    commitTags(safeTags.filter((t) => t !== value));
  };

  const updateSelectedColor = (color: string) => {
    if (!selectedTag) {
      return;
    }
    commitTags(safeTags, { ...safeTagColors, [selectedTag]: color });
  };

  return (
    <Popover.Root onOpenChange={onOpenChange} open={open}>
      <Popover.Trigger render={children as any} />
      <Popover.Portal>
        <Popover.Positioner side="bottom" sideOffset={6}>
          <Popover.Popup
            className="nodrag nopan z-50 w-72 origin-(--transform-origin) rounded-lg border border-black/5 bg-white p-3 text-sm shadow-xl outline-none dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-100"
            onClick={stopPopoverEvent}
            onContextMenu={stopPopoverEvent}
            onDoubleClick={stopPopoverEvent}
            onMouseDown={stopPopoverEvent}
            onPointerDown={stopPopoverEvent}
          >
            <div className="flex min-h-7 flex-wrap gap-1.5">
              {safeTags.map((value) => (
                <span
                  className={cn(
                    'inline-flex items-center overflow-hidden rounded-md border text-xs',
                    selectedTag === value
                      ? 'border-blue-500 ring-2 ring-blue-500/20'
                      : 'border-black/5 dark:border-white/10',
                    safeTagColors[value]
                      ? 'text-neutral-800'
                      : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200'
                  )}
                  key={value}
                  style={colorToStyle(safeTagColors[value])}
                >
                  <button
                    aria-label={value}
                    className="px-2 py-1 font-medium"
                    onClick={() => setSelectedTag(value)}
                    type="button"
                  >
                    {value}
                  </button>
                  <button
                    aria-label={m.tag_editor_remove()}
                    className="p-1 hover:bg-black/10 dark:hover:bg-white/10"
                    onClick={() => removeTag(value)}
                    type="button"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            {selectedTag ? (
              <div className="mt-2 flex items-center gap-1.5">
                {CARD_COLORS.map((color) => {
                  const selected = safeTagColors[selectedTag] === color;
                  return (
                    <button
                      aria-label={color}
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full border border-black/10 transition-transform hover:scale-110 dark:border-white/15',
                        selected && 'ring-2 ring-blue-500 ring-offset-1'
                      )}
                      key={color}
                      onClick={() => updateSelectedColor(color)}
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
            ) : null}
            <div className="mt-2 flex items-stretch gap-1.5">
              <input
                className={cn(
                  'min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-neutral-900 dark:focus:border-white/30',
                  limitReached && 'cursor-not-allowed opacity-50'
                )}
                disabled={limitReached}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setActiveSuggestion(0);
                }}
                onCompositionEnd={() => {
                  composingRef.current = false;
                }}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onKeyDown={handleKeyDown}
                placeholder={m.tag_editor_placeholder()}
                ref={inputRef}
                type="text"
                value={draft}
              />
              <button
                aria-label={m.tag_editor_add()}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-md border border-black/10 bg-neutral-900 text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500 dark:border-white/10 dark:bg-neutral-100 dark:text-neutral-900 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-400 dark:hover:bg-white'
                )}
                disabled={!canCommitDraft}
                onClick={commitDraft}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                type="button"
              >
                <Check size={14} />
              </button>
            </div>
            {filteredSuggestions.length > 0 ? (
              <ul
                aria-label={m.tag_editor_placeholder()}
                className="mt-1 max-h-44 overflow-y-auto rounded-md border border-black/5 bg-white py-1 shadow-sm dark:border-white/10 dark:bg-neutral-900"
              >
                {filteredSuggestions.map((name, idx) => {
                  const isActive = idx === activeSuggestion;
                  return (
                    <li key={name} role="presentation">
                      <button
                        aria-selected={isActive}
                        className={cn(
                          'flex w-full items-center px-2 py-1 text-left text-sm',
                          isActive
                            ? 'bg-neutral-100 dark:bg-neutral-800'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/60'
                        )}
                        onClick={() => addTagValue(name)}
                        onMouseDown={(e) => {
                          // Prevent input blur (which would otherwise commit
                          // draft before the click registers).
                          e.preventDefault();
                        }}
                        role="option"
                        type="button"
                      >
                        {name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
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
