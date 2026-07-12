import { describe, expect, it } from 'vitest';

import { getFolderExpandedChildTransition } from './FolderExpandedChildNode';

describe('getFolderExpandedChildTransition', () => {
  it('starts every waterfall row together and gives upper rows more travel time', () => {
    const bottom = getFolderExpandedChildTransition(
      {
        motionCount: 8,
        motionDepth: 0,
        motionOrder: 0,
        phase: 'open',
      },
      false
    );
    const top = getFolderExpandedChildTransition(
      {
        motionCount: 8,
        motionDepth: 1,
        motionOrder: 7,
        phase: 'open',
      },
      false
    );

    expect(bottom.delay).toBe(0);
    expect(top.delay).toBe(0);
    expect(bottom.duration).toBe(0.34);
    expect(top.duration).toBeCloseTo(0.44);
  });

  it('keeps collapse simultaneous and faster than expansion', () => {
    const bottom = getFolderExpandedChildTransition(
      {
        motionCount: 8,
        motionDepth: 0,
        motionOrder: 0,
        phase: 'closing',
      },
      false
    );
    const top = getFolderExpandedChildTransition(
      {
        motionCount: 8,
        motionDepth: 1,
        motionOrder: 7,
        phase: 'closing',
      },
      false
    );

    expect(bottom.delay).toBe(0);
    expect(top.delay).toBe(0);
    expect(bottom.duration).toBe(0.28);
    expect(top.duration).toBeCloseTo(0.34);
  });

  it('collapses timing for reduced motion', () => {
    expect(
      getFolderExpandedChildTransition(
        {
          motionCount: 8,
          motionDepth: 1,
          motionOrder: 7,
          phase: 'open',
        },
        true
      )
    ).toMatchObject({ delay: 0, duration: 0.01 });
  });
});
