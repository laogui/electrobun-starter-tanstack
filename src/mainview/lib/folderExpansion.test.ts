import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildFolderExpansionNodes,
  FOLDER_EXPANDED_CHILD_NODE_TYPE,
  type FolderExpandedChildData,
  MAX_FOLDER_PREVIEWS,
} from './folderExpansion';

function folder(children: Array<{ id: string; type?: string }>): Node {
  return {
    id: 'folder-1',
    type: 'folder',
    position: { x: 500, y: 600 },
    style: { width: 280, height: 280 },
    data: {
      children: children.map((child) => ({
        id: child.id,
        type: child.type ?? 'card',
        data: { title: child.id, content: child.id },
      })),
    },
  };
}

describe('buildFolderExpansionNodes', () => {
  it('materializes at most five render-only React Flow children above the folder', () => {
    const source = folder(
      Array.from({ length: 7 }, (_, index) => ({ id: `child-${index}` }))
    );
    const expanded = buildFolderExpansionNodes({
      allNodes: [source],
      closing: false,
      folderId: source.id,
    });

    expect(expanded).toHaveLength(MAX_FOLDER_PREVIEWS);
    expect(
      expanded.every((node) => node.type === FOLDER_EXPANDED_CHILD_NODE_TYPE)
    ).toBe(true);
    expect(expanded.every((node) => node.position.y < source.position.y)).toBe(
      true
    );
    expect(expanded.every((node) => node.draggable === false)).toBe(true);
  });

  it('uses distinct thumbnail origins and keeps the row centered on the folder', () => {
    const source = folder([
      { id: 'a' },
      { id: 'b', type: 'image' },
      { id: 'c' },
    ]);
    const expanded = buildFolderExpansionNodes({
      allNodes: [source],
      closing: false,
      folderId: source.id,
    });
    const firstOrigin = expanded[0]!.data.origin as { x: number; y: number };
    const lastOrigin = expanded[2]!.data.origin as { x: number; y: number };
    expect(firstOrigin).not.toEqual(lastOrigin);

    const left = Math.min(...expanded.map((node) => node.position.x));
    const right = Math.max(
      ...expanded.map(
        (node) =>
          node.position.x + ((node.style as { width: number }).width ?? 0)
      )
    );
    expect((left + right) / 2).toBeCloseTo(640, 5);
    expect(expanded[0]!.data.target).toMatchObject({
      height: expect.any(Number),
      width: expect.any(Number),
      x: expanded[0]!.position.x - source.position.x,
      y: expanded[0]!.position.y - source.position.y,
    });
    const firstData = expanded[0]!.data as FolderExpandedChildData;
    expect(firstData.target.width * firstData.origin.scaleX).toBeCloseTo(
      280 * 0.32,
      5
    );
    expect(firstData.target.height * firstData.origin.scaleY).toBeCloseTo(
      280 * 0.52,
      5
    );
  });

  it('switches the shared-element nodes into the reverse closing phase', () => {
    const source = folder([{ id: 'a' }]);
    const expanded = buildFolderExpansionNodes({
      allNodes: [source],
      closing: true,
      folderId: source.id,
    });
    expect(expanded[0]!.data.phase).toBe('closing');
  });

  it('places expansion children above the existing React Flow z-index range', () => {
    const source = folder([{ id: 'a' }, { id: 'b' }]);
    source.zIndex = 3200;
    const expanded = buildFolderExpansionNodes({
      allNodes: [source],
      closing: false,
      folderId: source.id,
    });

    expect(expanded.every((node) => (node.zIndex ?? 0) > 4200)).toBe(true);
  });
});
