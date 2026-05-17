import { describe, expect, it, vi } from 'vitest';

import { listAllTemplates, loadTemplate } from './templates';

vi.mock('electrobun/bun', () => ({
  Utils: {
    paths: { userData: '/mock-user-data' },
  },
}));

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
    expect(template?.noteContents).toBeDefined();

    // Should have 3 groups + 6 cards + 1 sticky = 10 nodes
    expect(template?.nodes).toHaveLength(10);

    // Should have 6 note contents (one per card)
    expect(Object.keys(template?.noteContents ?? {})).toHaveLength(6);
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

  it('every card node references a valid noteContent key', () => {
    const template = loadTemplate('kanban');
    const noteKeys = new Set(Object.keys(template?.noteContents ?? {}));

    const cardNodes = template?.nodes.filter((n) => n.type === 'card') ?? [];
    expect(cardNodes.length).toBeGreaterThan(0);

    for (const card of cardNodes) {
      const noteId = card.data.noteId as string;
      expect(noteKeys.has(noteId)).toBe(true);
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

    expect(groups).toHaveLength(7);
    // 7 daily checklist cards + 1 weekly review card.
    expect(cards.length).toBeGreaterThanOrEqual(8);

    // Each daily card is parented to its day group.
    const childCards = cards.filter((c) => typeof c.parentId === 'string');
    expect(childCards.length).toBeGreaterThanOrEqual(7);
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
  });
});
