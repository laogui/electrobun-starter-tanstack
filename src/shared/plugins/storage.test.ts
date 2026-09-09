import { describe, expect, it } from 'vitest';
import { cloneStorageValue } from './storage';

describe('plugin storage JSON contract', () => {
  it('returns a detached JSON tree including shared, non-cyclic input objects', () => {
    const shared = { value: 1 };
    const input = { first: shared, second: shared };
    const cloned = cloneStorageValue(input);
    shared.value = 2;
    expect(cloned).toEqual({ first: { value: 1 }, second: { value: 1 } });
  });
  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1n,
    new Date(),
    new Map(),
    () => 1,
    { value: undefined },
    [undefined],
    new Array(2),
    { [Symbol('key')]: 1 },
  ])('rejects non-JSON values: %s', (value) => {
    expect(() => cloneStorageValue(value)).toThrow();
  });
  it('rejects cyclic or oversized values', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => cloneStorageValue(value)).toThrow('cycles');
    expect(() => cloneStorageValue('x'.repeat(1_048_576))).toThrow('1 MiB');
  });
  it('rejects excessive depth', () => {
    let value: unknown = null;
    for (let index = 0; index < 66; index += 1) {
      value = [value];
    }
    expect(() => cloneStorageValue(value)).toThrow('64 levels');
  });
});
