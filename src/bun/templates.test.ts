import { describe, expect, it, vi } from 'vitest';

import { listAllTemplates, loadTemplate } from './templates';

vi.mock('electrobun/bun', () => ({
  Utils: {
    paths: { userData: '/mock-user-data' },
  },
}));

function collectWidgetRefs(nodes: Array<{ data: any; type?: string }>) {
  const refs: string[] = [];
  for (const node of nodes) {
    if (node.type === 'widget' && typeof node.data?.widgetId === 'string') {
      refs.push(node.data.widgetId);
      continue;
    }
    if (node.type !== 'folder' || !Array.isArray(node.data?.children)) {
      continue;
    }
    for (const child of node.data.children) {
      if (
        child?.type === 'widget' &&
        typeof child.data?.widgetId === 'string'
      ) {
        refs.push(child.data.widgetId);
      }
    }
  }
  return refs;
}

function collectLegacyChecklistCards(
  nodes: Array<{ data: any; type?: string }>
) {
  const legacy: string[] = [];
  for (const node of nodes) {
    if (node.type === 'card' && node.data?.type === 'checklist') {
      legacy.push(String(node.data.noteId ?? node.data.title ?? 'unknown'));
      continue;
    }
    if (node.type !== 'folder' || !Array.isArray(node.data?.children)) {
      continue;
    }
    for (const child of node.data.children) {
      if (child?.type === 'card' && child.data?.type === 'checklist') {
        legacy.push(String(child.data.noteId ?? child.id ?? 'unknown'));
      }
    }
  }
  return legacy;
}

describe('templates', () => {
  it('listAllTemplates returns the built-in kanban template', () => {
    const templates = listAllTemplates();

    const kanban = templates.find((t) => t.id === 'kanban');
    expect(kanban).toBeDefined();
    expect(kanban?.name).toBe('Kanban Board');
    expect(kanban?.category).toBe('planning');
    expect(kanban?.tags).toContain('kanban');
  });

  it('listAllTemplates returns the built-in demo template', () => {
    const templates = listAllTemplates();

    const demo = templates.find((t) => t.id === 'demo');
    expect(demo).toBeDefined();
    expect(demo?.name).toBe('Demo Canvas');
    expect(demo?.tags).toContain('demo');
  });

  it('loadTemplate returns the demo template with mixed node types', () => {
    const template = loadTemplate('demo');

    expect(template).not.toBeNull();
    expect(template?.meta.id).toBe('demo');

    // Demo showcases card / folder / group / sticky / image primitives.
    const types = new Set(template?.nodes.map((n) => n.type));
    expect(types).toContain('card');
    expect(types).toContain('folder');
    expect(types).toContain('group');
    expect(types).toContain('sticky');
    expect(types).toContain('image');

    // Every top-level card with a noteId should reference a real noteContent.
    const noteKeys = new Set(Object.keys(template?.noteContents ?? {}));
    const cardsWithNotes =
      template?.nodes.filter(
        (n) => n.type === 'card' && typeof n.data.noteId === 'string'
      ) ?? [];
    expect(cardsWithNotes.length).toBeGreaterThan(0);
    for (const card of cardsWithNotes) {
      expect(noteKeys.has(card.data.noteId as string)).toBe(true);
    }
  });

  it('listAllTemplates returns copies (not references to internal data)', () => {
    const a = listAllTemplates();
    const b = listAllTemplates();

    expect(a).toEqual(b);
    // Mutating one should not affect the other
    expect(a[0]).toBeDefined();
    expect(b[0]).toBeDefined();
    if (a[0] && b[0]) {
      a[0].name = 'MUTATED';
      expect(b[0].name).not.toBe('MUTATED');
    }
  });

  it('loadTemplate returns the kanban template with nodes and edges', () => {
    const template = loadTemplate('kanban');

    expect(template).not.toBeNull();
    expect(template?.meta.id).toBe('kanban');
    expect(template?.nodes.length).toBeGreaterThan(0);
    expect(template?.edges).toBeDefined();
    expect(template?.widgets).toBeDefined();

    // Should have 3 groups + 6 checklist widgets + 1 sticky = 10 nodes.
    expect(template?.nodes).toHaveLength(10);

    // Should have 6 widget records (one per checklist widget).
    expect(Object.keys(template?.widgets ?? {})).toHaveLength(6);
  });

  it('loadTemplate returns null for a non-existent template', () => {
    const template = loadTemplate('does-not-exist');
    expect(template).toBeNull();
  });

  it('loadTemplate noteContents have required fields', () => {
    const template = loadTemplate('kanban');

    for (const [, content] of Object.entries(template?.noteContents ?? {})) {
      expect(content.title).toBeTruthy();
      expect(content.displayHint).toBeTruthy();
      expect(content.body).toBeTruthy();
    }
  });

  it('kanban checklist widgets reference valid widget records', () => {
    const template = loadTemplate('kanban');
    const widgetKeys = new Set(Object.keys(template?.widgets ?? {}));
    const refs = collectWidgetRefs(template?.nodes ?? []);

    expect(refs).toHaveLength(6);
    for (const widgetId of refs) {
      expect(widgetKeys.has(widgetId)).toBe(true);
      expect(template?.widgets?.[widgetId]?.kind).toBe('checklist');
    }
  });

  // -------------------------------------------------------------------------
  // P0 templates added in May 2026 — make sure each one is registered, has
  // the right category, and produces a self-consistent (cards ↔ noteContents)
  // manifest. Per-template structural sanity checks live in their own block
  // below to keep failures localized.
  // -------------------------------------------------------------------------

  const P0_TEMPLATES: {
    id: string;
    category: 'planning' | 'thinking' | 'knowledge' | 'blank';
  }[] = [
    { id: 'quick-start', category: 'blank' },
    { id: 'blank', category: 'blank' },
    { id: 'weekly-planner', category: 'planning' },
    { id: 'sprint-retro', category: 'planning' },
    { id: 'brainstorm-mindmap', category: 'thinking' },
    { id: 'eisenhower-matrix', category: 'thinking' },
    { id: 'reading-notes', category: 'knowledge' },
  ];

  it('all P0 templates are registered with the correct category', () => {
    const list = listAllTemplates();
    for (const expected of P0_TEMPLATES) {
      const tpl = list.find((t) => t.id === expected.id);
      expect(
        tpl,
        `template "${expected.id}" should be registered`
      ).toBeDefined();
      expect(tpl?.category).toBe(expected.category);
    }
  });

  it.each(
    P0_TEMPLATES.filter((t) => t.id !== 'blank')
  )('template "$id" has consistent card → noteContents references', ({
    id,
  }) => {
    const template = loadTemplate(id);
    expect(template).not.toBeNull();

    const noteKeys = new Set(Object.keys(template?.noteContents ?? {}));
    const cardsWithNotes =
      template?.nodes.filter(
        (n) => n.type === 'card' && typeof n.data.noteId === 'string'
      ) ?? [];

    for (const card of cardsWithNotes) {
      expect(noteKeys.has(card.data.noteId as string)).toBe(true);
    }

    // Every noteContent has the three required fields.
    for (const [, content] of Object.entries(template?.noteContents ?? {})) {
      expect(content.title).toBeTruthy();
      expect(content.displayHint).toBeTruthy();
      expect(typeof content.body).toBe('string');
    }

    const widgetKeys = new Set(Object.keys(template?.widgets ?? {}));
    for (const widgetId of collectWidgetRefs(template?.nodes ?? [])) {
      expect(widgetKeys.has(widgetId)).toBe(true);
    }
  });

  it.each(
    P0_TEMPLATES.filter((t) => t.id !== 'blank')
  )('template "$id" does not ship legacy checklist cards', ({ id }) => {
    const template = loadTemplate(id);
    expect(template).not.toBeNull();
    expect(collectLegacyChecklistCards(template?.nodes ?? [])).toEqual([]);
    for (const [, content] of Object.entries(template?.noteContents ?? {})) {
      expect(content.displayHint).not.toBe('checklist');
    }
  });

  it('demo and kanban checklist templates use widget seed records', () => {
    for (const id of ['demo', 'kanban'] as const) {
      const template = loadTemplate(id);
      expect(template).not.toBeNull();
      expect(collectWidgetRefs(template?.nodes ?? []).length).toBeGreaterThan(
        0
      );
      expect(Object.keys(template?.widgets ?? {}).length).toBeGreaterThan(0);
    }
  });

  it('quick-start showcases the core node primitives + at least one edge', () => {
    const template = loadTemplate('quick-start');
    expect(template).not.toBeNull();

    const types = new Set(template?.nodes.map((n) => n.type));
    expect(types).toContain('card');
    expect(types).toContain('sticky');
    expect(types).toContain('folder');
    expect(types).toContain('group');

    // Connections are a hero capability — the Quick Start must demonstrate them.
    expect(template?.edges.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('cafe template keeps notes, photos, and extension cards wired together', () => {
    const template = loadTemplate('cafe');
    expect(template).not.toBeNull();
    expect(template?.meta.category).toBe('planning');
    expect(template?.nodes.some((node) => node.type === 'topic')).toBe(true);
    expect(template?.nodes.some((node) => node.type === 'extension')).toBe(
      true
    );

    const noteKeys = new Set(Object.keys(template?.noteContents ?? {}));
    for (const node of template?.nodes ?? []) {
      if (node.type === 'card' && typeof node.data.noteId === 'string') {
        expect(noteKeys.has(node.data.noteId)).toBe(true);
      }
      if (node.type === 'extension') {
        const instanceId = node.data.instanceId;
        expect(typeof instanceId).toBe('string');
        expect(
          template?.extensionInstances?.[instanceId as string]
        ).toBeDefined();
      }
    }

    const assets = template?.assets ?? {};
    expect(Object.keys(assets).length).toBeGreaterThan(0);
    for (const seed of Object.values(template?.extensionInstances ?? {})) {
      const state = JSON.stringify(seed.state);
      for (const match of state.matchAll(/tpl-asset:([^"]+)/g)) {
        expect(assets[match[1] ?? '']).toBeTruthy();
      }
    }
  });

  it('blank template has no nodes or edges', () => {
    const template = loadTemplate('blank');
    expect(template).not.toBeNull();
    expect(template?.nodes).toEqual([]);
    expect(template?.edges).toEqual([]);
  });

  it('weekly-planner has 7 day groups + 7 daily checklists', () => {
    const template = loadTemplate('weekly-planner');
    expect(template).not.toBeNull();

    const groups = template?.nodes.filter((n) => n.type === 'group') ?? [];
    const cards = template?.nodes.filter((n) => n.type === 'card') ?? [];
    const widgets = template?.nodes.filter((n) => n.type === 'widget') ?? [];

    expect(groups).toHaveLength(7);
    // 7 daily checklist widgets + 1 weekly review card.
    expect(widgets).toHaveLength(7);
    expect(cards).toHaveLength(1);

    // Each daily widget is parented to its day group.
    const childWidgets = widgets.filter((w) => typeof w.parentId === 'string');
    expect(childWidgets).toHaveLength(7);
  });

  it('brainstorm-mindmap relies heavily on labeled connections', () => {
    const template = loadTemplate('brainstorm-mindmap');
    expect(template).not.toBeNull();

    // 1 center card + 6 branches + 6 sub-branches → at least 12 edges to chain them.
    expect(template?.edges.length ?? 0).toBeGreaterThanOrEqual(12);
    expect(template?.nodes.length ?? 0).toBeGreaterThanOrEqual(13);

    // All edges must reference real nodes.
    const nodeIds = new Set(template?.nodes.map((n) => n.id));
    for (const edge of template?.edges ?? []) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });

  it('eisenhower-matrix has the four quadrants + nested stickies', () => {
    const template = loadTemplate('eisenhower-matrix');
    expect(template).not.toBeNull();

    const groups = template?.nodes.filter((n) => n.type === 'group') ?? [];
    const stickies = template?.nodes.filter((n) => n.type === 'sticky') ?? [];

    expect(groups).toHaveLength(4);
    // Each quadrant has at least 3 example stickies.
    expect(stickies.length).toBeGreaterThanOrEqual(13);
  });

  it('reading-notes exposes image / link / folder primitives', () => {
    const template = loadTemplate('reading-notes');
    expect(template).not.toBeNull();

    const types = new Set(template?.nodes.map((n) => n.type));
    expect(types).toContain('image');
    expect(types).toContain('link');
    expect(types).toContain('folder');
    expect(types).toContain('card');
    expect(types).toContain('sticky');
    expect(types).toContain('widget');
  });
});
