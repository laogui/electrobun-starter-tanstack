import { describe, expect, it } from 'vitest';
import {
  buildNewNodeSpec,
  CANVAS_NODE_SPECS,
  CARD_H,
  CARD_W,
  FOLDER_H,
  FOLDER_W,
  findSpecByNodeType,
  getNodeSpec,
  IMAGE_H,
  IMAGE_W,
  STICKY_H,
  STICKY_W,
} from '@/lib/canvasNodeRegistry';
import type { CanvasNodeKind } from '@/lib/contentTypes';

describe('CANVAS_NODE_SPECS', () => {
  it('exposes a spec for every CanvasNodeKind', () => {
    const expected: CanvasNodeKind[] = [
      'card',
      'checklist',
      'pomodoro',
      'reminder',
      'sticky',
      'folder',
      'group',
      'image',
      'asset',
      'link',
      'recording',
      'topic',
    ];
    for (const kind of expected) {
      expect(CANVAS_NODE_SPECS[kind]).toBeDefined();
      expect(CANVAS_NODE_SPECS[kind].kind).toBe(kind);
    }
  });

  it.each([
    ['card', { width: CARD_W, height: CARD_H }],
    ['sticky', { width: STICKY_W, height: STICKY_H }],
    ['folder', { width: FOLDER_W, height: FOLDER_H }],
    ['image', { width: IMAGE_W, height: IMAGE_H }],
  ] as const)('uses canonical size for %s', (kind, size) => {
    expect(CANVAS_NODE_SPECS[kind].size).toEqual(size);
  });

  it('uses one shared widget size for all widget creation kinds', () => {
    expect(CANVAS_NODE_SPECS.checklist.size).toEqual(
      CANVAS_NODE_SPECS.pomodoro.size
    );
    expect(CANVAS_NODE_SPECS.reminder.size).toEqual(
      CANVAS_NODE_SPECS.checklist.size
    );
    expect(CANVAS_NODE_SPECS.checklist.size.width).toBeGreaterThan(0);
    expect(CANVAS_NODE_SPECS.checklist.size.height).toBeGreaterThan(0);
  });

  it('encodes group/folder eligibility per docs §11', () => {
    expect(CANVAS_NODE_SPECS.card.canEnterGroup).toBe(true);
    expect(CANVAS_NODE_SPECS.card.canEnterFolder).toBe(true);

    expect(CANVAS_NODE_SPECS.checklist.canEnterGroup).toBe(true);
    expect(CANVAS_NODE_SPECS.checklist.canEnterFolder).toBe(false);
    expect(CANVAS_NODE_SPECS.pomodoro.canEnterGroup).toBe(true);
    expect(CANVAS_NODE_SPECS.pomodoro.canEnterFolder).toBe(false);
    expect(CANVAS_NODE_SPECS.reminder.canEnterGroup).toBe(true);
    expect(CANVAS_NODE_SPECS.reminder.canEnterFolder).toBe(false);

    expect(CANVAS_NODE_SPECS.image.canEnterGroup).toBe(true);
    expect(CANVAS_NODE_SPECS.image.canEnterFolder).toBe(true);

    expect(CANVAS_NODE_SPECS.sticky.canEnterGroup).toBe(true);
    expect(CANVAS_NODE_SPECS.sticky.canEnterFolder).toBe(false);

    expect(CANVAS_NODE_SPECS.folder.canEnterGroup).toBe(true);
    expect(CANVAS_NODE_SPECS.folder.canEnterFolder).toBe(false);

    expect(CANVAS_NODE_SPECS.group.canEnterGroup).toBe(false);
    expect(CANVAS_NODE_SPECS.group.canEnterFolder).toBe(false);

    // Reserved Phase 1 specs — must be group/folder-eligible so the rest of
    // the pipeline (drag, resolvePlacement) handles them like other content.
    expect(CANVAS_NODE_SPECS.asset.canEnterGroup).toBe(true);
    expect(CANVAS_NODE_SPECS.asset.canEnterFolder).toBe(true);
    expect(CANVAS_NODE_SPECS.link.canEnterGroup).toBe(true);
    expect(CANVAS_NODE_SPECS.link.canEnterFolder).toBe(true);
  });

  it('maps widget creation kinds to the shared widget React Flow node type', () => {
    expect(CANVAS_NODE_SPECS.card.nodeType).toBe('card');
    expect(CANVAS_NODE_SPECS.checklist.nodeType).toBe('widget');
    expect(CANVAS_NODE_SPECS.pomodoro.nodeType).toBe('widget');
    expect(CANVAS_NODE_SPECS.reminder.nodeType).toBe('widget');
  });
});

describe('getNodeSpec', () => {
  it('returns the spec for a known kind', () => {
    expect(getNodeSpec('image').nodeType).toBe('image');
  });
});

describe('findSpecByNodeType', () => {
  it('resolves React Flow types to their registered spec', () => {
    expect(findSpecByNodeType('image')?.kind).toBe('image');
    expect(findSpecByNodeType('folder')?.kind).toBe('folder');
    expect(findSpecByNodeType('group')?.kind).toBe('group');
    expect(findSpecByNodeType('sticky')?.kind).toBe('sticky');
  });

  it('returns null for unknown node types', () => {
    expect(findSpecByNodeType('totally-unknown')).toBeNull();
  });
});

describe('buildNewNodeSpec', () => {
  it('returns a card-typed text node by default', () => {
    const spec = buildNewNodeSpec('card');
    expect(spec.size).toEqual({ width: CARD_W, height: CARD_H });
    expect(spec.base.type).toBe('card');
    expect(spec.base.style).toEqual({ width: CARD_W, height: CARD_H });
    const data = spec.base.data as Record<string, unknown>;
    expect(data.type).toBe('text');
    expect(data.title).toBe('');
    expect(data.content).toBe('');
    expect(data.color).toBe('#FFFFFF');
  });

  it('produces widget-typed nodes with kind-specific data', () => {
    const spec = buildNewNodeSpec('checklist');
    expect(spec.base.type).toBe('widget');
    expect(spec.base.data).toEqual({ widgetId: '', kind: 'checklist' });

    const pomodoro = buildNewNodeSpec('pomodoro');
    expect(pomodoro.base.type).toBe('widget');
    expect(pomodoro.base.data).toEqual({ widgetId: '', kind: 'pomodoro' });

    const reminder = buildNewNodeSpec('reminder');
    expect(reminder.base.type).toBe('widget');
    expect(reminder.base.data).toEqual({ widgetId: '', kind: 'reminder' });
  });

  it('builds an image node with empty url defaults', () => {
    const spec = buildNewNodeSpec('image');
    expect(spec.base.type).toBe('image');
    expect(spec.size).toEqual({ width: IMAGE_W, height: IMAGE_H });
    const data = spec.base.data as Record<string, unknown>;
    expect(data.imageUrl).toBe('');
    expect(data.title).toBe('');
  });

  it('builds a link node with empty URL metadata defaults', () => {
    const spec = buildNewNodeSpec('link');
    expect(spec.base.type).toBe('link');
    expect(spec.size.width).toBeGreaterThan(0);
    expect(spec.size.height).toBeGreaterThanOrEqual(320);
    const data = spec.base.data as Record<string, unknown>;
    expect(data.url).toBe('');
    expect(data.title).toBe('');
    expect(data.color).toBe('#FFFFFF');
  });

  it('builds an asset node with empty file metadata defaults', () => {
    const spec = buildNewNodeSpec('asset');
    expect(spec.base.type).toBe('asset');
    expect(spec.size.width).toBeGreaterThan(0);
    expect(spec.size.height).toBeGreaterThan(0);
    const data = spec.base.data as Record<string, unknown>;
    expect(data.kind).toBe('file');
    expect(data.fileName).toBe('');
    expect(data.mimeType).toBe('application/octet-stream');
    expect(data.color).toBe('#FFFFFF');
  });

  it('builds a folder with an empty children array', () => {
    const spec = buildNewNodeSpec('folder');
    expect(spec.base.type).toBe('folder');
    const data = spec.base.data as Record<string, unknown>;
    expect(data.children).toEqual([]);
  });

  it('builds a sticky with content placeholder and a palette color', () => {
    const spec = buildNewNodeSpec('sticky');
    expect(spec.base.type).toBe('sticky');
    const data = spec.base.data as Record<string, unknown>;
    expect(data.content).toBe('');
    expect(typeof data.color).toBe('string');
  });

  it('builds a group with default size and a palette color', () => {
    const spec = buildNewNodeSpec('group');
    expect(spec.base.type).toBe('group');
    expect(spec.size.width).toBeGreaterThan(0);
    expect(spec.size.height).toBeGreaterThan(0);
    const data = spec.base.data as Record<string, unknown>;
    expect(typeof data.color).toBe('string');
  });
});
