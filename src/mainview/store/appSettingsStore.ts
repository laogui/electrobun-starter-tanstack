import { create } from 'zustand';

import {
  type AppSettings,
  DEFAULT_SETTINGS,
  type ThemeSetting,
} from '@/settingsClient';

/**
 * App-level settings store. Kept separate from `canvasStore` because these
 * settings live across all canvases, persist outside React Flow, and are
 * shared by the main window and the in-window Settings dialog.
 *
 * Components that care about a specific field (FocusedView for
 * `autoSaveInterval`, routes/index.tsx for `canvasBackground`, …) subscribe
 * directly so they only re-render when their slice changes.
 */
export interface AppSettingsState extends AppSettings {
  /**
   * Replace the entire settings record. Used by `__root.tsx` after loading
   * the initial settings or after a Settings dialog change.
   */
  applySettings: (settings: Partial<AppSettings>) => void;
  /**
   * Update a single field when a component already owns persistence.
   */
  setField: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => void;
  /** Convenience setter for the theme — keeps the legacy 'system' branch. */
  setTheme: (theme: ThemeSetting) => void;
}

export const useAppSettingsStore = create<AppSettingsState>((set) => ({
  ...DEFAULT_SETTINGS,
  applySettings: (next) => {
    const definedSettings = Object.fromEntries(
      Object.entries(next).filter(([, value]) => value !== undefined)
    ) as Partial<AppSettings>;
    set((prev) => ({
      ...prev,
      ...definedSettings,
    }));
  },
  setField: (key, value) => {
    set((prev) => ({ ...prev, [key]: value }));
  },
  setTheme: (theme) => {
    set({ theme });
  },
}));
