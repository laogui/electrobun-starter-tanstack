import { create } from 'zustand';

/** One thing whose colour the card colour popover changes. */
export type ColorPickerTarget =
  | { kind: 'node'; nodeId: string }
  | { childId: string; folderId: string; kind: 'folder-child' };

export interface ColorPickerRequest {
  /** Screen point the popover opens from (the context-menu position). */
  anchor: { x: number; y: number };
  /** Which palette to offer. */
  palette: 'card' | 'group' | 'sticky';
  targets: ColorPickerTarget[];
}

interface ColorPickerState {
  close: () => void;
  open: (request: ColorPickerRequest) => void;
  request: ColorPickerRequest | null;
}

export const useColorPickerStore = create<ColorPickerState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));
