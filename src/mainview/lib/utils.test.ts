import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/utils';

describe('cn', () => {
  it('merges classes and resolves tailwind conflicts', () => {
    expect(cn('px-2', 'px-4', 'text-sm')).toBe('px-4 text-sm');
  });

  it('handles conditional and nullable class values', () => {
    expect(cn('base', false, null, undefined, ['rounded'])).toBe(
      'base rounded'
    );
  });
});
