import { describe, expect, it } from 'vitest';

import { getLocaleStrings } from './getLocaleStrings';

describe('getLocaleStrings', () => {
  it('returns the English settings strings from the shared message source', () => {
    const strings = getLocaleStrings('en');

    expect(strings.title).toBe('Settings');
    expect(strings.navWorkspace).toBe('Workspace');
    expect(strings.workspaceSwitchSuccess('/tmp/ghostboard')).toBe(
      'Switched workspace to /tmp/ghostboard.'
    );
    expect(strings.cleanupCount(1)).toBe('1 unlinked file');
    expect(strings.cleanupCount(3)).toBe('3 unlinked files');
  });

  it('returns the Chinese settings strings from the shared message source', () => {
    const strings = getLocaleStrings('zh');

    expect(strings.title).toBe('设置');
    expect(strings.navWorkspace).toBe('工作区');
    expect(strings.workspaceSwitchSuccess('/tmp/ghostboard')).toBe(
      '已切换工作区到 /tmp/ghostboard。'
    );
    expect(strings.cleanupCount(1)).toBe('1 个未关联文件');
    expect(strings.cleanupCount(3)).toBe('3 个未关联文件');
  });

  it('keeps both locales on the same settings string contract', () => {
    expect(Object.keys(getLocaleStrings('zh')).sort()).toEqual(
      Object.keys(getLocaleStrings('en')).sort()
    );
  });
});
