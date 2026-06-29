import { describe, expect, it } from 'vitest';

import { getBlockNoteDebounceMs } from './blockNoteEditorTiming';

describe('getBlockNoteDebounceMs', () => {
  it('uses the auto-save setting as milliseconds without scaling it', () => {
    expect(getBlockNoteDebounceMs(800)).toBe(800);
  });
});
