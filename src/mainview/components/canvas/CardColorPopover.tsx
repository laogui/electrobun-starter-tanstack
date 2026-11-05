import { Popover } from '@base-ui/react/popover';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ColorSwatchPanel } from '@/components/ui/ColorSwatchPanel';
import {
  addCanvasBackgroundCustom,
  CARD_COLOR_CUSTOMS_KEY,
  loadColorCustoms,
  removeCanvasBackgroundCustom,
  saveColorCustoms,
} from '@/lib/canvasBackgroundCustoms';
import { CARD_COLORS, STICKY_COLORS } from '@/lib/colorUtils';
import type { FolderChildEntry } from '@/store/canvas/folderChildren';
import { useCanvasStore } from '@/store/canvasStore';
import {
  type ColorPickerTarget,
  useColorPickerStore,
} from '@/store/colorPickerStore';

import * as m from '../../../paraglide/messages.js';

function currentColor(target: ColorPickerTarget): string | undefined {
  const { nodes } = useCanvasStore.getState();
  if (target.kind === 'node') {
    const color = nodes.find((node) => node.id === target.nodeId)?.data.color;
    return typeof color === 'string' ? color : undefined;
  }
  const children = nodes.find((node) => node.id === target.folderId)?.data
    .children as FolderChildEntry[] | undefined;
  const color = children?.find((child) => child.id === target.childId)?.data
    ?.color;
  return typeof color === 'string' ? color : undefined;
}

/**
 * Card colour chooser, the same palette as the canvas background. Opened from
 * the context menu's "Change colour". One popover session is one undo step:
 * the first change snapshots the canvas, later changes in the same session
 * (including dragging the custom picker) update in place.
 */
export function CardColorPopover() {
  const request = useColorPickerStore((s) => s.request);
  const close = useColorPickerStore((s) => s.close);
  const [customs, setCustoms] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const snapshotTakenRef = useRef(false);

  const palette = request?.palette === 'sticky' ? STICKY_COLORS : CARD_COLORS;
  const fallback = palette[0];

  useEffect(() => {
    if (!request) {
      return;
    }
    snapshotTakenRef.current = false;
    setCustoms(loadColorCustoms(CARD_COLOR_CUSTOMS_KEY));
    const first = request.targets[0];
    setSelected((first && currentColor(first)) ?? fallback);
  }, [request, fallback]);

  const anchor = useMemo(() => {
    if (!request) {
      return null;
    }
    const { x, y } = request.anchor;
    return { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) };
  }, [request]);

  const apply = (color: string) => {
    if (!request) {
      return;
    }
    const store = useCanvasStore.getState();
    if (!snapshotTakenRef.current) {
      store.saveSnapshot();
      snapshotTakenRef.current = true;
    }
    for (const target of request.targets) {
      if (target.kind === 'node') {
        store.updateNodeData(target.nodeId, { color });
      } else {
        store.updateFolderChildData(target.folderId, target.childId, {
          color,
        });
      }
    }
    setSelected(color);
  };

  const presets = palette.map((color, index) => ({
    color,
    label: m.card_color_swatch_label({ index: String(index + 1) }),
  }));

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      open={request !== null}
    >
      <Popover.Portal>
        <Popover.Positioner
          align="start"
          anchor={anchor}
          collisionPadding={12}
          side="right"
          sideOffset={4}
        >
          <Popover.Popup className="floating-menu-popup z-50 w-[23rem] rounded-3xl border border-black/5 bg-white/90 p-4 shadow-xl outline-hidden backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/95 dark:text-neutral-100">
            <div className="mb-3 text-center">
              <Popover.Title className="font-medium text-lg">
                {m.card_color_picker_title()}
              </Popover.Title>
              <Popover.Description className="mt-0.5 text-neutral-500 text-sm dark:text-neutral-400">
                {m.canvas_bg_picker_description()}
              </Popover.Description>
            </div>
            <ColorSwatchPanel
              addLabel={m.canvas_bg_add_color()}
              customs={customs}
              isSelected={(value) =>
                value.toLowerCase() === selected.toLowerCase()
              }
              onAddCustom={(value) => {
                setCustoms((prev) => {
                  const next = addCanvasBackgroundCustom(prev, value);
                  saveColorCustoms(CARD_COLOR_CUSTOMS_KEY, next);
                  return next;
                });
                apply(value);
              }}
              onPickerChange={apply}
              onRemoveCustom={(value) => {
                setCustoms((prev) => {
                  const next = removeCanvasBackgroundCustom(prev, value);
                  saveColorCustoms(CARD_COLOR_CUSTOMS_KEY, next);
                  return next;
                });
              }}
              onSelect={apply}
              pickerTitle={m.canvas_bg_color_picker_title()}
              pickerValue={selected || fallback}
              presets={presets}
              removeLabel={m.canvas_bg_remove_color()}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
