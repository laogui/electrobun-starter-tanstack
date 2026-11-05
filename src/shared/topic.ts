/**
 * Topic (主题) data contract, shared by the renderer and the Bun main process.
 *
 * A Topic is a core canvas node — not an extension — holding a single
 * compact title. Hierarchy is expressed exclusively by `labeledEdge` records
 * tagged with `data.kind: 'topic-child'`; nothing about the tree is duplicated
 * onto the node, so the edge set is the only source of truth for parentage.
 *
 * This module is framework-free on purpose: `src/bun/*` validates untrusted
 * manifest input with the same parsers the renderer uses, because a TypeScript
 * declaration alone does not validate a file read from disk.
 */

/** React Flow `node.type` for a Topic. */
export const TOPIC_NODE_TYPE = 'topic';

/** `edge.data.kind` marking a parent → child tree relation. */
export const TOPIC_CHILD_EDGE_KIND = 'topic-child';

/** Version of the persisted Topic node payload. */
export const TOPIC_VERSION = 1;

/** Version of the persisted tree relation payload. Tracked separately from
 *  `TOPIC_VERSION`: content and relation records evolve independently. */
export const TOPIC_RELATION_VERSION = 1;

/**
 * Upper bound on a title, counted in Unicode code points (not UTF-16 units) so
 * emoji and CJK characters cost what a reader expects. Over-long input is
 * rejected with the draft preserved rather than silently truncated.
 */
export const TOPIC_TITLE_MAX_LENGTH = 2000;

// --- Geometry ---------------------------------------------------------------
// Canvas logical units, not screen pixels. Tuning starting points per plan §3.1
// and §5; frozen only after real-device acceptance.

export const TOPIC_MIN_WIDTH = 80;
export const TOPIC_MAX_WIDTH = 320;
export const TOPIC_MIN_HEIGHT = 36;
export const TOPIC_PADDING_X = 12;
export const TOPIC_PADDING_Y = 8;
/** Horizontal gap between a parent and its children. */
export const TOPIC_LEVEL_GAP = 64;
/** Vertical gap between adjacent siblings. */
export const TOPIC_SIBLING_GAP = 16;

// --- Colors -----------------------------------------------------------------

/**
 * Closed token set shared with the color picker. Tokens are stored, never raw
 * CSS, so a manifest can't inject an arbitrary style value and the palette can
 * be restyled without rewriting user files.
 */
export const TOPIC_COLOR_TOKENS = [
  'neutral',
  'blue',
  'green',
  'yellow',
  'orange',
  'pink',
  'purple',
] as const;

export type TopicColorToken = (typeof TOPIC_COLOR_TOKENS)[number];

export const TOPIC_DEFAULT_COLOR: TopicColorToken = 'neutral';

const TOPIC_COLOR_TOKEN_SET: ReadonlySet<string> = new Set(TOPIC_COLOR_TOKENS);

export function isTopicColorToken(value: unknown): value is TopicColorToken {
  return typeof value === 'string' && TOPIC_COLOR_TOKEN_SET.has(value);
}

/**
 * Token to use for rendering. An unrecognized token (e.g. written by a newer
 * build) falls back to the default for display only — the stored value is left
 * alone so a downgrade doesn't destroy it.
 */
export function resolveTopicColorToken(value: unknown): TopicColorToken {
  return isTopicColorToken(value) ? value : TOPIC_DEFAULT_COLOR;
}

// --- Node data --------------------------------------------------------------

export interface TopicDataV1 {
  color: TopicColorToken;
  title: string;
  topicVersion: 1;
}

export type TopicParseStatus =
  /** Well-formed v1 payload. */
  | 'valid'
  /** Recognizable Topic, but a `topicVersion` this build does not understand.
   *  Render read-only, preserve the original record. */
  | 'unsupported-version'
  /** Structurally broken (missing/ill-typed title). Never coerce to empty. */
  | 'invalid';

export interface TopicParseResult {
  /** Populated only when `status === 'valid'`. */
  data?: TopicDataV1;
  reason?: string;
  status: TopicParseStatus;
  /** Best-effort title for read-only display of unsupported/invalid records. */
  title: string;
  version?: number;
}

function countCodePoints(value: string): number {
  let count = 0;
  for (const _ of value) {
    count += 1;
  }
  return count;
}

/** True when the title fits the persisted length budget. */
export function isTopicTitleWithinLimit(title: string): boolean {
  return countCodePoints(title) <= TOPIC_TITLE_MAX_LENGTH;
}

/**
 * Canonical form of a committed title: plain text, single-line, trimmed.
 * Newlines collapse to spaces so a pasted paragraph cannot break the single-row
 * layout or the Markdown outline export.
 */
export function normalizeTopicTitle(raw: string): string {
  return raw.replace(/\s*\r?\n\s*/g, ' ').trim();
}

export function isTopicNodeType(type: string | undefined | null): boolean {
  return type === TOPIC_NODE_TYPE;
}

export function parseTopicData(data: unknown): TopicParseResult {
  if (typeof data !== 'object' || data === null) {
    return { status: 'invalid', reason: 'data is not an object', title: '' };
  }
  const record = data as Record<string, unknown>;
  const rawTitle = record.title;
  const title = typeof rawTitle === 'string' ? rawTitle : '';
  const version = record.topicVersion;

  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return {
      status: 'invalid',
      reason: 'topicVersion is missing or not an integer',
      title,
    };
  }
  if (version !== TOPIC_VERSION) {
    return { status: 'unsupported-version', title, version };
  }
  if (typeof rawTitle !== 'string') {
    return {
      status: 'invalid',
      reason: 'title is missing or not a string',
      title: '',
      version,
    };
  }
  return {
    data: {
      color: resolveTopicColorToken(record.color),
      title: rawTitle,
      topicVersion: TOPIC_VERSION,
    },
    status: 'valid',
    title: rawTitle,
    version,
  };
}

export function createTopicData(
  title: string,
  color: TopicColorToken = TOPIC_DEFAULT_COLOR
): TopicDataV1 {
  return { color, title, topicVersion: TOPIC_VERSION };
}

// --- Tree edge data ---------------------------------------------------------

export interface TopicChildEdgeDataV1 {
  kind: typeof TOPIC_CHILD_EDGE_KIND;
  /** Stable rank among siblings of the same parent. Contiguous non-negative
   *  integers, renumbered inside the same transaction on insert/remove — never
   *  inferred from screen coordinates. */
  order: number;
  relationVersion: 1;
}

export type TopicEdgeParseStatus =
  | 'valid'
  | 'unsupported-version'
  | 'invalid'
  /** A plain association line. Explicitly not a tree relation. */
  | 'not-topic-edge';

export interface TopicEdgeParseResult {
  data?: TopicChildEdgeDataV1;
  reason?: string;
  status: TopicEdgeParseStatus;
  version?: number;
}

/**
 * True when the record claims to be a tree relation. Only `data.kind` counts —
 * a tree edge is never inferred from a label, marker, or endpoint appearance,
 * so a user-drawn association line can't turn into parentage by accident.
 */
export function isTopicChildEdgeData(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>).kind === TOPIC_CHILD_EDGE_KIND
  );
}

export function parseTopicChildEdgeData(data: unknown): TopicEdgeParseResult {
  if (!isTopicChildEdgeData(data)) {
    return { status: 'not-topic-edge' };
  }
  const record = data as Record<string, unknown>;
  const version = record.relationVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return {
      status: 'invalid',
      reason: 'relationVersion is missing or not an integer',
    };
  }
  if (version !== TOPIC_RELATION_VERSION) {
    return { status: 'unsupported-version', version };
  }
  const order = record.order;
  if (typeof order !== 'number' || !Number.isInteger(order) || order < 0) {
    return {
      status: 'invalid',
      reason: 'order must be a non-negative integer',
      version,
    };
  }
  return {
    data: {
      kind: TOPIC_CHILD_EDGE_KIND,
      order,
      relationVersion: TOPIC_RELATION_VERSION,
    },
    status: 'valid',
    version,
  };
}

export function createTopicChildEdgeData(order: number): TopicChildEdgeDataV1 {
  return {
    kind: TOPIC_CHILD_EDGE_KIND,
    order,
    relationVersion: TOPIC_RELATION_VERSION,
  };
}

/**
 * True for edges the host owns: label editing, visual reversal, animation, path
 * switching, and endpoint rewiring are all blocked on these. Callers must guard
 * on this rather than only hiding the menu item — the same rule has to hold for
 * double-click, context menu, and programmatic edge updates.
 */
export function isTopicTreeEdge(edge: {
  data?: Record<string, unknown> | null;
}): boolean {
  return isTopicChildEdgeData(edge.data);
}
