import { describe, expect, it } from 'vitest';
import {
  isCardContentData,
  isExtensionNodeData,
  toCardContentData,
  toImageData,
} from '@/components/canvas/nodes/nodeDataGuards';
import { CANVAS_EXPORT_SCHEMA } from '@/lib/canvasExport';
import { parseCanvasExportJson } from '@/lib/importCanvasFiles';

const instance = {
  appVersion: '1.0.0',
  canvasTypeId: 'ghostboard.counter/counter',
  createdAt: '2026-01-01T00:00:00.000Z',
  dataVersion: 1,
  id: 'extinst_abcdefgh',
  presentation: { title: 'Counter' },
  revision: 1,
  schema: 'ghostboard-extension-instance/v1',
  state: { count: 2 },
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const exportJson = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    edges: [],
    exportedAt: '2026-01-01T00:00:00.000Z',
    nodes: [{ data: {}, id: 'n1', position: { x: 0, y: 0 }, type: 'card' }],
    schema: CANVAS_EXPORT_SCHEMA,
    ...extra,
  });

describe('parseCanvasExportJson (untrusted canvas export files)', () => {
  it('accepts a well-formed export and keeps valid embedded records', () => {
    const parsed = parseCanvasExportJson(
      exportJson({
        extensionInstances: { extinst_abcdefgh: instance },
        viewport: { x: 1, y: 2, zoom: 1 },
      })
    );
    expect(parsed?.nodes).toHaveLength(1);
    expect(parsed?.extensionInstances?.extinst_abcdefgh).toMatchObject({
      canvasTypeId: 'ghostboard.counter/counter',
      state: { count: 2 },
    });
    expect(parsed?.viewport).toEqual({ x: 1, y: 2, zoom: 1 });
  });

  it('rejects malformed documents outright', () => {
    expect(parseCanvasExportJson('not json')).toBeNull();
    expect(parseCanvasExportJson('[]')).toBeNull();
    expect(parseCanvasExportJson(exportJson({ schema: 'other' }))).toBeNull();
    expect(parseCanvasExportJson(exportJson({ nodes: {} }))).toBeNull();
  });

  it('drops invalid embedded records and non-object nodes', () => {
    const parsed = parseCanvasExportJson(
      exportJson({
        edges: [null, { id: 'e', source: 'n1', target: 'n1' }],
        extensionInstances: { bad: { ...instance, revision: 0 } },
        nodes: [42, { id: 'n1' }],
      })
    );
    expect(parsed?.nodes).toEqual([{ id: 'n1' }]);
    expect(parsed?.edges).toHaveLength(1);
    expect(parsed?.extensionInstances).toEqual({});
  });
});

describe('node data guards', () => {
  it('keeps valid card data by identity and strips wrongly typed fields', () => {
    const valid = { color: '#fff', title: 'T' };
    expect(isCardContentData(valid)).toBe(true);
    expect(toCardContentData(valid)).toBe(valid);

    expect(toCardContentData({ color: 7, tags: ['a', 1], title: 'T' })).toEqual(
      { title: 'T' }
    );
  });

  it('gives image data a colour and drops non-string urls', () => {
    expect(toImageData({ imageUrl: 5, title: 'Pic' })).toEqual({
      color: '',
      title: 'Pic',
    });
  });

  it('recognizes extension node data', () => {
    expect(isExtensionNodeData({ canvasTypeId: 'a.b', instanceId: 'i' })).toBe(
      true
    );
    expect(isExtensionNodeData({ canvasTypeId: 'a.b' })).toBe(false);
  });
});
