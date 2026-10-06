import type { LocaleSetting } from '@/settingsClient';

import * as m from '../../paraglide/messages.js';

export const MOD_KEY =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent)
    ? '⌘'
    : 'Ctrl';
export const SHIFT_KEY = MOD_KEY === '⌘' ? '⇧' : 'Shift';

export interface LearningShortcut {
  keys: string[];
  label: string;
}

export interface LearningStep {
  description: string;
  id: 'move' | 'create' | 'find' | 'organize';
  shortcuts: LearningShortcut[];
  title: string;
}

export interface LearningTip {
  description: string;
  id: string;
  keys: string[];
  title: string;
}

export function getOnboardingSteps(locale: LocaleSetting): LearningStep[] {
  const options = { locale };
  return [
    {
      id: 'move',
      title: m.learning_move_title({}, options),
      description: m.learning_move_description({}, options),
      shortcuts: [
        {
          label: m.settings_shortcut_pan({}, options),
          keys: ['Space', m.learning_drag({}, options)],
        },
        {
          label: m.settings_shortcut_box_select({}, options),
          keys: [m.learning_drag_empty({}, options)],
        },
        {
          label: m.settings_shortcut_zoom({}, options),
          keys: [`${MOD_KEY} + / −`],
        },
      ],
    },
    {
      id: 'create',
      title: m.learning_create_title({}, options),
      description: m.learning_create_description({}, options),
      shortcuts: [
        {
          label: m.settings_shortcut_new_menu({}, options),
          keys: [MOD_KEY, 'N'],
        },
        {
          label: m.settings_shortcut_open_focused({}, options),
          keys: ['Enter'],
        },
        {
          label: m.learning_import_files({}, options),
          keys: [m.learning_drop_files({}, options)],
        },
      ],
    },
    {
      id: 'find',
      title: m.learning_find_title({}, options),
      description: m.learning_find_description({}, options),
      shortcuts: [
        {
          label: m.settings_shortcut_search({}, options),
          keys: [MOD_KEY, 'K'],
        },
        {
          label: m.settings_shortcut_navigate({}, options),
          keys: ['↑ ↓ ← →'],
        },
        {
          label: m.settings_shortcut_focused_close({}, options),
          keys: ['Esc'],
        },
      ],
    },
    {
      id: 'organize',
      title: m.learning_organize_title({}, options),
      description: m.learning_organize_description({}, options),
      shortcuts: [
        {
          label: m.settings_shortcut_group({}, options),
          keys: [MOD_KEY, 'G'],
        },
        {
          label: m.settings_shortcut_duplicate({}, options),
          keys: [MOD_KEY, 'D'],
        },
        {
          label: m.settings_shortcut_undo({}, options),
          keys: [MOD_KEY, 'Z'],
        },
      ],
    },
  ];
}

export function getDailyTips(locale: LocaleSetting): LearningTip[] {
  const options = { locale };
  return [
    {
      id: 'pan',
      title: m.tip_pan_title({}, options),
      description: m.tip_pan_description({}, options),
      keys: ['Space', m.learning_drag({}, options)],
    },
    {
      id: 'create',
      title: m.tip_create_title({}, options),
      description: m.tip_create_description({}, options),
      keys: [MOD_KEY, 'N'],
    },
    {
      id: 'search',
      title: m.tip_search_title({}, options),
      description: m.tip_search_description({}, options),
      keys: [MOD_KEY, 'K'],
    },
    {
      id: 'open',
      title: m.tip_open_title({}, options),
      description: m.tip_open_description({}, options),
      keys: ['Enter'],
    },
    {
      id: 'select',
      title: m.tip_select_title({}, options),
      description: m.tip_select_description({}, options),
      keys: [m.learning_drag_empty({}, options)],
    },
    {
      id: 'undo',
      title: m.tip_undo_title({}, options),
      description: m.tip_undo_description({}, options),
      keys: [MOD_KEY, 'Z'],
    },
    {
      id: 'group',
      title: m.tip_group_title({}, options),
      description: m.tip_group_description({}, options),
      keys: [MOD_KEY, 'G'],
    },
    {
      id: 'duplicate',
      title: m.tip_duplicate_title({}, options),
      description: m.tip_duplicate_description({}, options),
      keys: [MOD_KEY, 'D'],
    },
    {
      id: 'zoom',
      title: m.tip_zoom_title({}, options),
      description: m.tip_zoom_description({}, options),
      keys: [MOD_KEY, '0'],
    },
    {
      id: 'files',
      title: m.tip_files_title({}, options),
      description: m.tip_files_description({}, options),
      keys: [m.learning_drop_files({}, options)],
    },
    {
      id: 'library',
      title: m.tip_library_title({}, options),
      description: m.tip_library_description({}, options),
      keys: [],
    },
    {
      id: 'navigate',
      title: m.tip_navigate_title({}, options),
      description: m.tip_navigate_description({}, options),
      keys: ['↑ ↓ ← →'],
    },
  ];
}
