import { create } from 'zustand';
import { rpcSetExtensionEnabled } from '@/lib/rpc';
import { isCanvasTypeEnabled } from '../../shared/extensions/enablement';

export interface ExtensionEnablementState {
  disabledCanvasTypes: string[];
  hydrate: (disabledCanvasTypes: string[]) => void;
  isEnabled: (canvasTypeId: string) => boolean;
  setEnabled: (canvasTypeId: string, enabled: boolean) => Promise<boolean>;
}

export const useExtensionEnablementStore = create<ExtensionEnablementState>(
  (set, get) => ({
    disabledCanvasTypes: [],

    hydrate: (disabledCanvasTypes) => {
      set({ disabledCanvasTypes });
    },

    isEnabled: (canvasTypeId) =>
      isCanvasTypeEnabled(canvasTypeId, get().disabledCanvasTypes),

    setEnabled: async (canvasTypeId, enabled) => {
      const previous = get().disabledCanvasTypes;
      const next = enabled
        ? previous.filter((id) => id !== canvasTypeId)
        : previous.includes(canvasTypeId)
          ? previous
          : [...previous, canvasTypeId];
      set({ disabledCanvasTypes: next });
      const result = await rpcSetExtensionEnabled(canvasTypeId, enabled);
      if (!result.success) {
        set({ disabledCanvasTypes: previous });
        return false;
      }
      if (result.enablement) {
        set({ disabledCanvasTypes: result.enablement.disabledCanvasTypes });
      }
      return true;
    },
  })
);
