import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { searchCurrentView } from './useSearch';

function makeNode(
  id: string,
  type: string,
  data: Record<string, unknown>
): Node {
  return { id, type, position: { x: 0, y: 0 }, data } as unknown as Node;
}

describe('searchCurrentView', () => {
  it('returns empty for empty / whitespace queries', () => {
    expect(searchCurrentView('', [], 'v1', 'View 1')).toEqual([]);
    expect(searchCurrentView('   ', [], 'v1', 'View 1')).toEqual([]);
  });

  it('matches asset metadata across title, fileName, and mimeType', () => {
    const nodes = [
      makeNode('a1', 'asset', {
        title: 'Quarterly report',
        fileName: 'q3-financials.pdf',
        mimeType: 'application/pdf',
      }),
    ];

    const titleHits = searchCurrentView('quarterly', nodes, 'v1', 'View 1');
    expect(titleHits.find((r) => r.matchField === 'title')).toMatchObject({
      kind: 'asset',
      nodeId: 'a1',
    });

    const fileHits = searchCurrentView('q3-financials', nodes, 'v1', 'View 1');
    expect(fileHits.find((r) => r.matchField === 'fileName')).toBeDefined();

    const mimeHits = searchCurrentView(
      'application/pdf',
      nodes,
      'v1',
      'View 1'
    );
    expect(mimeHits.find((r) => r.matchField === 'mimeType')).toBeDefined();
  });

  it('matches link metadata across title, url, description, and siteName', () => {
    const nodes = [
      makeNode('l1', 'link', {
        title: 'Docs',
        url: 'https://example.com/docs',
        description: 'Reference manual entry point',
        siteName: 'Example Docs',
      }),
    ];

    const urlHits = searchCurrentView(
      'example.com/docs',
      nodes,
      'v1',
      'View 1'
    );
    expect(urlHits.find((r) => r.matchField === 'url')).toMatchObject({
      kind: 'link',
      nodeId: 'l1',
    });

    const descHits = searchCurrentView(
      'reference manual',
      nodes,
      'v1',
      'View 1'
    );
    expect(descHits.find((r) => r.matchField === 'description')).toBeDefined();

    const siteHits = searchCurrentView('example docs', nodes, 'v1', 'View 1');
    expect(siteHits.find((r) => r.matchField === 'siteName')).toBeDefined();
  });

  it('asset title outranks fileName and mimeType for the same query', () => {
    const nodes = [
      makeNode('a1', 'asset', {
        title: 'pdf overview',
        fileName: 'pdf-overview.pdf',
        mimeType: 'application/pdf',
      }),
    ];
    const results = searchCurrentView('pdf', nodes, 'v1', 'View 1');
    const titleHit = results.find((r) => r.matchField === 'title');
    const fileHit = results.find((r) => r.matchField === 'fileName');
    const mimeHit = results.find((r) => r.matchField === 'mimeType');
    expect(titleHit).toBeDefined();
    expect(fileHit).toBeDefined();
    expect(mimeHit).toBeDefined();
    expect(titleHit!.score).toBeGreaterThan(fileHit!.score);
    expect(fileHit!.score).toBeGreaterThan(mimeHit!.score);
  });

  it('skips empty optional fields without producing results', () => {
    const nodes = [
      makeNode('a1', 'asset', {
        title: 'Standalone',
        fileName: '',
        mimeType: '',
      }),
    ];
    const results = searchCurrentView('standalone', nodes, 'v1', 'View 1');
    expect(results).toHaveLength(1);
    expect(results[0]?.matchField).toBe('title');
  });
});
