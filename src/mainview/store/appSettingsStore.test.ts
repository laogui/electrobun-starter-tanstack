import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/settingsClient';

import { useAppSettingsStore } from './appSettingsStore';

describe('appSettingsStore', () => {
  beforeEach(() => {
    useAppSettingsStore.setState(DEFAULT_SETTINGS);
  });

  it('initialises with default settings', () => {
    const state = useAppSettingsStore.getState();
    expect(state.theme).toBe('system');
    expect(state.locale).toBe('en');
    expect(state.fontFamily).toBe('system');
    expect(state.canvasBackground).toBe('default');
    expect(state.autoSaveInterval).toBe(800);
  });

  it('applySettings merges partial updates', () => {
    useAppSettingsStore
      .getState()
      .applySettings({ theme: 'dark', locale: 'zh' });
    const state = useAppSettingsStore.getState();
    expect(state.theme).toBe('dark');
    expect(state.locale).toBe('zh');
    expect(state.fontFamily).toBe('system');
  });

  it('applySettings ignores undefined values from partial updates', () => {
    useAppSettingsStore.getState().applySettings({ theme: 'dark' });
    useAppSettingsStore
      .getState()
      .applySettings({ theme: undefined } as Partial<typeof DEFAULT_SETTINGS>);

    expect(useAppSettingsStore.getState().theme).toBe('dark');
  });

  it('setField updates a single key', () => {
    useAppSettingsStore.getState().setField('fontFamily', 'serif');
    expect(useAppSettingsStore.getState().fontFamily).toBe('serif');
  });

  it('setTheme changes the theme', () => {
    useAppSettingsStore.getState().setTheme('light');
    expect(useAppSettingsStore.getState().theme).toBe('light');
  });
});
