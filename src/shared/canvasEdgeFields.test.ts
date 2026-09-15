import { describe, expect, it } from 'vitest';

import {
  buildLegacyEdgeCompatPatch,
  getEdgeLabelText,
  isEdgeAnimated,
  resolveEdgeAnimated,
  resolveEdgeFields,
  resolveEdgeLabel,
} from './canvasEdgeFields';

describe('resolveEdgeLabel', () => {
  it('reads the historical top-level label when data has no label', () => {
    const resolved = resolveEdgeLabel({ label: 'legacy' });
    expect(resolved).toEqual({
      invalid: false,
      origin: 'legacy',
      value: 'legacy',
    });
  });

  it('reads data.label when present', () => {
    const resolved = resolveEdgeLabel({ data: { label: 'current' } });
    expect(resolved).toEqual({
      invalid: false,
      origin: 'data',
      value: 'current',
    });
  });

  it('prefers data.label over a conflicting top-level label', () => {
    expect(
      getEdgeLabelText({ data: { label: 'current' }, label: 'legacy' })
    ).toBe('current');
  });

  it('does not let a stale top-level label resurrect an explicitly cleared label', () => {
    expect(getEdgeLabelText({ data: { label: '' }, label: 'legacy' })).toBe('');
  });

  it('treats an explicit undefined in data as absent so the legacy value wins', () => {
    // JSON drops `undefined`, so honoring it would make the winner depend on
    // whether the record went through a serialization round-trip.
    expect(
      getEdgeLabelText({ data: { label: undefined }, label: 'legacy' })
    ).toBe('legacy');
  });

  it('reports an ill-typed data.label instead of falling back to the legacy value', () => {
    const resolved = resolveEdgeLabel({ data: { label: 42 }, label: 'legacy' });
    expect(resolved).toEqual({
      invalid: true,
      invalidValue: 42,
      origin: 'data',
      value: '',
    });
  });

  it('reports an ill-typed legacy label', () => {
    const resolved = resolveEdgeLabel({ label: { text: 'x' } });
    expect(resolved.invalid).toBe(true);
    expect(resolved.origin).toBe('legacy');
    expect(resolved.value).toBe('');
  });

  it('defaults to an empty label when neither slot is set', () => {
    expect(resolveEdgeLabel({})).toEqual({
      invalid: false,
      origin: 'default',
      value: '',
    });
  });
});

describe('resolveEdgeAnimated', () => {
  it('reads the historical top-level flag when data has none', () => {
    expect(isEdgeAnimated({ animated: true })).toBe(true);
  });

  it('does not let a stale top-level true override an explicit data false', () => {
    expect(isEdgeAnimated({ animated: true, data: { animated: false } })).toBe(
      false
    );
  });

  it('reports an ill-typed animated flag', () => {
    const resolved = resolveEdgeAnimated({ data: { animated: 'yes' } });
    expect(resolved.invalid).toBe(true);
    expect(resolved.value).toBe(false);
  });

  it('defaults to false', () => {
    expect(resolveEdgeAnimated({})).toEqual({
      invalid: false,
      origin: 'default',
      value: false,
    });
  });
});

describe('resolveEdgeFields', () => {
  it('resolves both fields independently', () => {
    const fields = resolveEdgeFields({
      animated: true,
      data: { label: 'from data' },
      label: 'from legacy',
    });
    expect(fields.label.value).toBe('from data');
    expect(fields.label.origin).toBe('data');
    expect(fields.animated.value).toBe(true);
    expect(fields.animated.origin).toBe('legacy');
  });

  it('ignores unknown data keys', () => {
    const fields = resolveEdgeFields({
      data: { futureField: 'keep-me', label: 'hi' },
    });
    expect(fields.label.value).toBe('hi');
  });
});

describe('buildLegacyEdgeCompatPatch', () => {
  it('syncs the top-level copy when the edge already carries one', () => {
    const edge = { animated: false, label: 'old' };
    expect(buildLegacyEdgeCompatPatch(edge, { label: 'new' })).toEqual({
      label: 'new',
    });
  });

  it('does not grow the legacy shape on an edge that never had it', () => {
    expect(
      buildLegacyEdgeCompatPatch({ data: {} }, { label: 'new' })
    ).toBeNull();
  });

  it('only syncs the fields actually being updated', () => {
    const edge = { animated: true, label: 'old' };
    expect(buildLegacyEdgeCompatPatch(edge, { animated: false })).toEqual({
      animated: false,
    });
  });

  it('ignores updates to fields with no legacy counterpart', () => {
    const edge = { label: 'old' };
    expect(
      buildLegacyEdgeCompatPatch(edge, { color: '#fff', pathType: 'bezier' })
    ).toBeNull();
  });

  it('syncs a cleared label so the two slots do not diverge', () => {
    const edge = { label: 'old' };
    expect(buildLegacyEdgeCompatPatch(edge, { label: '' })).toEqual({
      label: '',
    });
  });
});
