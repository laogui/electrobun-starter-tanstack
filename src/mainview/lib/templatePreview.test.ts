import { describe, expect, it } from 'vitest';

import { templatePreviewNodes } from './templatePreview';

describe('templatePreviewNodes', () => {
  it('fills cards from noteContents and tags from nodeMetadata', () => {
    const [card] = templatePreviewNodes({
      nodes: [
        {
          id: 'c',
          type: 'card',
          position: { x: 0, y: 0 },
          data: { noteId: 'tpl-n', color: '#FFFFFF' },
        },
      ],
      noteContents: {
        'tpl-n': { title: '选题卡', body: '## 标题', color: '#FFFBEB' },
      },
      nodeMetadata: { 'tpl-n': { tags: ['选题'] } },
    });
    expect(card?.data).toMatchObject({
      title: '选题卡',
      content: '## 标题',
      color: '#FFFFFF',
      tags: ['选题'],
    });
  });

  it('turns image and link extension seeds into self-contained nodes', () => {
    const [image, link] = templatePreviewNodes({
      nodes: [
        {
          id: 'i',
          type: 'extension',
          position: { x: 0, y: 0 },
          data: { canvasTypeId: 'ghostboard.media/image', instanceId: 'x1' },
        },
        {
          id: 'l',
          type: 'extension',
          position: { x: 0, y: 0 },
          data: { canvasTypeId: 'ghostboard.web/link', instanceId: 'x2' },
        },
      ],
      assets: { 'a.jpg': 'QUJD' },
      extensionInstances: {
        x1: {
          canvasTypeId: 'ghostboard.media/image',
          state: { title: '现场', imageFile: 'tpl-asset:a.jpg' },
        },
        x2: {
          canvasTypeId: 'ghostboard.web/link',
          state: { title: '咖啡', url: 'https://example.com' },
        },
      },
    });
    expect(image?.type).toBe('image');
    expect(image?.data).toMatchObject({
      title: '现场',
      imageUrl: 'data:image/jpeg;base64,QUJD',
    });
    expect(link?.type).toBe('link');
    expect(link?.data).toMatchObject({
      title: '咖啡',
      url: 'https://example.com',
      unfurlStatus: 'ready',
    });
  });

  it('leaves nodes it cannot resolve untouched', () => {
    const node = {
      id: 's',
      type: 'sticky',
      position: { x: 0, y: 0 },
      data: { content: 'hi' },
    };
    expect(templatePreviewNodes({ nodes: [node] })).toEqual([node]);
  });
});
