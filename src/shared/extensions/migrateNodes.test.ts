import { describe, expect, it } from 'vitest';

import {
  persistableExtensionNode,
  rewriteToExtensionNode,
} from './migrateNodes';

describe('persistableExtensionNode', () => {
  it('keeps canvasTypeId and instanceId and drops hydrated payload fields', () => {
    expect(
      persistableExtensionNode(
        {
          id: 'n1',
          type: 'link',
          data: {
            url: 'https://example.com',
            title: 'Docs',
            canvasTypeId: 'stale',
            instanceId: 'stale',
          },
        },
        'ghostboard.web/link',
        'extinst_1'
      )
    ).toEqual({
      id: 'n1',
      type: 'extension',
      data: {
        canvasTypeId: 'ghostboard.web/link',
        instanceId: 'extinst_1',
      },
    });
  });

  it('preserves detached when migrating a library note', () => {
    expect(
      persistableExtensionNode(
        {
          id: 'n1',
          type: 'link',
          data: {
            url: 'https://example.com',
            detached: true,
          },
        },
        'ghostboard.web/link',
        'extinst_1'
      ).data
    ).toEqual({
      canvasTypeId: 'ghostboard.web/link',
      instanceId: 'extinst_1',
      detached: true,
    });
  });

  it('does not persist a false detached flag', () => {
    expect(
      persistableExtensionNode(
        {
          id: 'n1',
          type: 'link',
          data: { detached: false },
        },
        'ghostboard.web/link',
        'extinst_1'
      ).data
    ).toEqual({
      canvasTypeId: 'ghostboard.web/link',
      instanceId: 'extinst_1',
    });
  });
});

describe('rewriteToExtensionNode', () => {
  it('preserves detached on the rewritten node data', () => {
    expect(
      rewriteToExtensionNode(
        {
          id: 'n1',
          type: 'asset',
          data: { fileName: 'a.pdf', detached: true },
        },
        'ghostboard.media/file',
        'extinst_2'
      )
    ).toEqual({
      id: 'n1',
      type: 'extension',
      data: {
        canvasTypeId: 'ghostboard.media/file',
        instanceId: 'extinst_2',
        detached: true,
      },
    });
  });
});
