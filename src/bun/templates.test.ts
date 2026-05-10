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
    a[0].name = 'MUTATED';
    expect(b[0].name).not.toBe('MUTATED');
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
});
