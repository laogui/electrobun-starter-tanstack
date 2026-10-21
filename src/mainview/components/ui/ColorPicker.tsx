import { Popover } from '@base-ui/react/popover';
import { Pipette, Plus } from 'lucide-react';
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RgbaColorPicker } from 'react-colorful';

import { hexToRgba, type RgbaColor, rgbaToHex } from '@/lib/hexColor';
import { cn } from '@/lib/utils';
import * as m from '../../../paraglide/messages.js';

const DEFAULT_TRIGGER = (
  <div className="flex aspect-square size-fit items-center justify-center rounded-full bg-gradient-to-br from-pink-300/20 via-violet-300/20 to-indigo-300/20 p-0.5">
    <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-gradient-to-br from-pink-300 via-violet-300 to-indigo-300">
      <Pipette aria-hidden className="size-4 text-white" />
    </div>
  </div>
);

export interface ColorPickerProps {
  addLabel?: string;
  children?: ReactNode;
  handleAdd?: (value: string) => void;
  onChange: (value: string) => void;
  title?: string;
  value: string;
}

function useDebouncedCallback(
  callback: (value: string) => void,
  delayMs: number
) {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );

  return useCallback(
    (value: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        callbackRef.current(value);
      }, delayMs);
    },
    [delayMs]
  );
}

/**
 * Popover color picker ported from shadcn-color-picker, upgraded onto
 * Base UI Popover + react-colorful (no Radix / lodash).
 */
export function ColorPicker({
  addLabel = 'Add New Colour',
  children = DEFAULT_TRIGGER,
  handleAdd,
  onChange,
  title = 'Colour Picker',
  value,
}: ColorPickerProps) {
  const rgba = useMemo(
    () => hexToRgba(value) ?? { r: 239, g: 243, b: 244, a: 1 },
    [value]
  );
  const alpha = rgba.a;
  const debouncedOnChange = useDebouncedCallback(onChange, 50);
  const [draftHex, setDraftHex] = useState(value);

  useEffect(() => {
    setDraftHex(value);
  }, [value]);

  const handleColorChange = useCallback(
    (next: RgbaColor) => {
      debouncedOnChange(rgbaToHex(next.r, next.g, next.b, next.a));
    },
    [debouncedOnChange]
  );

  const handleChangeAlpha = (event: ChangeEvent<HTMLInputElement>) => {
    const nextAlpha = Number.parseFloat(event.target.value);
    if (Number.isNaN(nextAlpha)) {
      return;
    }
    onChange(
      rgbaToHex(rgba.r, rgba.g, rgba.b, Math.min(1, Math.max(0, nextAlpha)))
    );
  };

  const handleChangeHex = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setDraftHex(next);
    if (hexToRgba(next)) {
      onChange(next);
    }
  };

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={title}
        className="rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60"
        type="button"
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="center" side="top" sideOffset={8}>
          <Popover.Popup className="z-[80] flex h-[25rem] w-[18rem] origin-(--transform-origin) flex-col rounded-xl border border-black/5 bg-white p-4 shadow-xl outline-hidden dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100">
            <Popover.Title className="mb-3 text-center font-medium text-lg">
              {title}
            </Popover.Title>
            <RgbaColorPicker
              className="aspect-square w-full"
              color={rgba}
              onChange={handleColorChange}
              style={{ width: '100%' }}
            />
            <div className="mt-3 flex w-full flex-col items-center gap-3">
              <div className="flex h-10 w-full items-center">
                <label
                  className="mr-2 shrink-0 text-sm"
                  htmlFor="color-picker-hex"
                >
                  HEX
                </label>
                <input
                  className="h-10 w-full rounded-l-md border border-neutral-200 bg-white px-3 font-mono text-sm tracking-widest outline-hidden focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 dark:border-neutral-700 dark:bg-neutral-950"
                  id="color-picker-hex"
                  onChange={handleChangeHex}
                  spellCheck={false}
                  value={draftHex}
                />
                <input
                  aria-label={m.a11y_color_alpha()}
                  className="h-10 w-16 rounded-r-md border border-neutral-200 border-l-0 bg-white px-2 font-mono text-sm tracking-widest outline-hidden focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 dark:border-neutral-700 dark:bg-neutral-950"
                  max={1}
                  min={0}
                  onChange={handleChangeAlpha}
                  step={0.01}
                  type="number"
                  value={alpha.toFixed(2)}
                />
              </div>
              {handleAdd ? (
                <button
                  className={cn(
                    'inline-flex h-10 w-full items-center justify-center gap-1 rounded-md bg-neutral-900 px-3 font-medium text-sm text-white transition-colors',
                    'hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-accent/60',
                    'dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white'
                  )}
                  onClick={() => {
                    handleAdd(value);
                  }}
                  type="button"
                >
                  <Plus aria-hidden className="size-4" />
                  {addLabel}
                </button>
              ) : null}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
