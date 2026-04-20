import { describe, expectTypeOf, it } from 'vitest';

import type { OmitClassName } from './OmitClassName';

describe('OmitClassName', () => {
  it('removes className from the source type', () => {
    interface Input {
      className?: string;
      id: string;
      title: string;
    }

    type Result = OmitClassName<Input>;

    expectTypeOf<Result>().toEqualTypeOf<{
      id: string;
      title: string;
    }>();
  });

  it('preserves other optional properties', () => {
    interface Input {
      className: string;
      disabled?: boolean;
      value?: number;
    }

    type Result = OmitClassName<Input>;

    expectTypeOf<Result>().toEqualTypeOf<{
      value?: number;
      disabled?: boolean;
    }>();
  });
});
