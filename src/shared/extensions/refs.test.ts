import { describe, expect, it } from 'vitest';

import { collectExtensionInstanceIds } from './refs';

describe('collectExtensionInstanceIds', () => {
  it('collects top-level and folder-child instance ids', () => {
    expect(
      collectExtensionInstanceIds([
        {
          type: 'extension',
          data: {
            canvasTypeId: 'ghostboard.demo/counter',
            instanceId: 'extinst_aaaaaaaaaaaa',
          },
        },
        {
          type: 'folder',
          data: {
            children: [
              {
                type: 'extension',
                data: {
                  canvasTypeId: 'ghostboard.demo/counter',
                  instanceId: 'extinst_bbbbbbbbbbbb',
                },
              },
              { type: 'card', data: { noteId: 'n1' } },
            ],
          },
        },
        { type: 'card', data: {} },
      ])
    ).toEqual(['extinst_aaaaaaaaaaaa', 'extinst_bbbbbbbbbbbb']);
  });

  it('ignores invalid instance ids', () => {
    expect(
      collectExtensionInstanceIds([
        { type: 'extension', data: { instanceId: '../x' } },
        { type: 'extension', data: { instanceId: '' } },
      ])
    ).toEqual([]);
  });
});
