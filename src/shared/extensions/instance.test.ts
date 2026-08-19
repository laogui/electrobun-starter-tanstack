import { describe, expect, it } from 'vitest';

import { generateInstanceId } from './ids';
import {
  EXTENSION_INSTANCE_SCHEMA,
  parseExtensionInstanceRecord,
  serializeExtensionInstance,
} from './instance';

function validRecord(overrides?: Record<string, unknown>) {
  return {
    schema: EXTENSION_INSTANCE_SCHEMA,
    id: generateInstanceId(),
    canvasTypeId: 'ghostboard.demo/counter',
    appVersion: '1.0.0',
    dataVersion: 1,
    revision: 3,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:01:00.000Z',
    state: { count: 4 },
    presentation: { title: 'Counter', subtitle: '4' },
    ...overrides,
  };
}

describe('parseExtensionInstanceRecord', () => {
  it('accepts a valid envelope and leaves state opaque', () => {
    const parsed = parseExtensionInstanceRecord(validRecord());
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) {
      return;
    }
    expect(parsed.record.state).toEqual({ count: 4 });
    expect(parsed.record.presentation.title).toBe('Counter');
    expect(parsed.extras).toEqual({});
  });

  it('round-trips unknown envelope fields', () => {
    const raw = validRecord({
      futureHostField: { nested: true },
      another: 'keep-me',
    });
    const parsed = parseExtensionInstanceRecord(raw);
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) {
      return;
    }
    expect(parsed.extras).toEqual({
      futureHostField: { nested: true },
      another: 'keep-me',
    });
    expect(serializeExtensionInstance(parsed)).toMatchObject({
      schema: EXTENSION_INSTANCE_SCHEMA,
      canvasTypeId: 'ghostboard.demo/counter',
      futureHostField: { nested: true },
      another: 'keep-me',
      state: { count: 4 },
    });
  });

  it('does not reject an unknown state shape', () => {
    const parsed = parseExtensionInstanceRecord(
      validRecord({ state: { fromNewerApp: [1, 2, 3] } })
    );
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) {
      return;
    }
    expect(parsed.record.state).toEqual({ fromNewerApp: [1, 2, 3] });
  });

  it('rejects a broken envelope without dropping the id when present', () => {
    const id = generateInstanceId();
    expect(
      parseExtensionInstanceRecord({
        schema: 'nope',
        id,
        canvasTypeId: 'ghostboard.demo/counter',
      })
    ).toEqual({ id, error: 'corrupted' });
  });
});
