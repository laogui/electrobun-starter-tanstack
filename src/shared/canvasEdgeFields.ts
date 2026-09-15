/**
 * Effective-field projection for canvas edges.
 *
 * Edges have carried `label` / `animated` in two places over time: as top-level
 * keys on the edge record (the historical shape still present in templates and
 * older manifests) and inside `data` (what the runtime writes today). Renderer,
 * search, and export must agree on which one wins, otherwise an edge can show
 * one label on the canvas and match a different one in search.
 *
 * Rules (see docs/features/In Progress/topic-mindmap-implementation-plan.md §4.1):
 * - `data.<field>` is the canonical format. Its mere *presence* wins, so an
 *   explicit empty label or `animated: false` is never overwritten by a stale
 *   top-level value.
 * - The top-level key is a historical compatibility field, consulted only when
 *   the `data` field is absent.
 * - A present-but-wrong-typed value is reported as invalid instead of silently
 *   falling back, so bad data surfaces as a diagnostic rather than looking like
 *   clean legacy data. The original value is never rewritten on read.
 */

/** Minimal structural view of an edge record from any layer (manifest, React
 *  Flow, clipboard). */
export interface CanvasEdgeFieldSource {
  animated?: unknown;
  data?: Record<string, unknown> | null;
  label?: unknown;
}

/** Which slot supplied the effective value. */
export type CanvasEdgeFieldOrigin = 'data' | 'legacy' | 'default';

export interface CanvasEdgeFieldResolution<T> {
  /** True when the winning slot held a value of an unexpected type. */
  invalid: boolean;
  /**
   * The value carried by the winning slot when it failed validation. Present
   * only when `invalid` is true; callers should surface a diagnostic and keep
   * the stored record untouched.
   */
  invalidValue?: unknown;
  origin: CanvasEdgeFieldOrigin;
  /** Safe value to render, index, or export. */
  value: T;
}

export interface CanvasEdgeFields {
  animated: CanvasEdgeFieldResolution<boolean>;
  label: CanvasEdgeFieldResolution<string>;
}

function hasOwn(
  record: Record<string, unknown> | null | undefined,
  key: string
): record is Record<string, unknown> {
  return Boolean(record) && Object.hasOwn(record as object, key);
}

function resolve<T>(
  edge: CanvasEdgeFieldSource,
  key: 'animated' | 'label',
  fallback: T,
  validate: (value: unknown) => T | undefined
): CanvasEdgeFieldResolution<T> {
  // `undefined` in either slot reads as "not set": JSON round-trips drop it,
  // so treating it as present would make the winner depend on serialization.
  const dataPresent = hasOwn(edge.data, key) && edge.data[key] !== undefined;
  if (dataPresent) {
    const raw = (edge.data as Record<string, unknown>)[key];
    const parsed = validate(raw);
    return parsed === undefined
      ? { invalid: true, invalidValue: raw, origin: 'data', value: fallback }
      : { invalid: false, origin: 'data', value: parsed };
  }

  const legacyRaw = edge[key];
  if (legacyRaw === undefined) {
    return { invalid: false, origin: 'default', value: fallback };
  }
  const parsed = validate(legacyRaw);
  return parsed === undefined
    ? {
        invalid: true,
        invalidValue: legacyRaw,
        origin: 'legacy',
        value: fallback,
      }
    : { invalid: false, origin: 'legacy', value: parsed };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function resolveEdgeLabel(
  edge: CanvasEdgeFieldSource
): CanvasEdgeFieldResolution<string> {
  return resolve(edge, 'label', '', asString);
}

export function resolveEdgeAnimated(
  edge: CanvasEdgeFieldSource
): CanvasEdgeFieldResolution<boolean> {
  return resolve(edge, 'animated', false, asBoolean);
}

export function resolveEdgeFields(
  edge: CanvasEdgeFieldSource
): CanvasEdgeFields {
  return {
    animated: resolveEdgeAnimated(edge),
    label: resolveEdgeLabel(edge),
  };
}

/** Effective label text, for callers that only need the string. */
export function getEdgeLabelText(edge: CanvasEdgeFieldSource): string {
  return resolveEdgeLabel(edge).value;
}

/** Effective animated flag, for callers that only need the boolean. */
export function isEdgeAnimated(edge: CanvasEdgeFieldSource): boolean {
  return resolveEdgeAnimated(edge).value;
}

const COMPAT_FIELDS = ['animated', 'label'] as const;
type CompatField = (typeof COMPAT_FIELDS)[number];

/**
 * Compute the top-level compatibility keys to write alongside a `data` update.
 *
 * Only edges that *already* carry a top-level `label` / `animated` get their
 * historical copy refreshed, so an edited legacy edge does not keep two
 * conflicting values forever. New edges stay `data`-only — we do not
 * retroactively grow the historical shape.
 *
 * Returns the partial top-level patch to merge into the edge record, or `null`
 * when nothing needs syncing.
 */
export function buildLegacyEdgeCompatPatch(
  edge: CanvasEdgeFieldSource,
  dataUpdates: Record<string, unknown>
): Partial<Record<CompatField, unknown>> | null {
  let patch: Partial<Record<CompatField, unknown>> | null = null;
  for (const field of COMPAT_FIELDS) {
    if (!(Object.hasOwn(dataUpdates, field) && Object.hasOwn(edge, field))) {
      continue;
    }
    patch ??= {};
    patch[field] = dataUpdates[field];
  }
  return patch;
}
