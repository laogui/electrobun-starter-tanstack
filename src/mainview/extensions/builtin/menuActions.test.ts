// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import type { GhostBoardHostAPI } from '../../../shared/extensions/protocol';
import {
  fileMenuActions,
  imageMenuActions,
  recordingMenuActions,
} from './media/menuActions';
import { linkCanvasType } from './web/link';

function createMockHost(): GhostBoardHostAPI {
  return {
    assets: {
      getMetadata: vi.fn(async () => ({
        mimeType: 'image/png',
        name: 'photo.png',
        size: 12,
        kind: 'image' as const,
        thumbnailId: 'attachments/thumb.png',
      })),
      getUrl: vi.fn(),
      importFile: vi.fn(async () => ({ id: 'attachments/photo.png' })),
      remove: vi.fn(),
      reveal: vi.fn(async () => undefined),
    },
    canvas: {
      closeDetail: vi.fn(async () => undefined),
      openDetail: vi.fn(async () => undefined),
      requestResize: vi.fn(async () => ({ width: 0, height: 0 })),
      requestTitleEdit: vi.fn(async () => undefined),
    },
    external: {
      openUrl: vi.fn(async () => undefined),
    },
    instance: {
      getState: vi.fn(),
      updateState: vi.fn(async (request) => ({
        presentation: { title: '' },
        revision: 2,
        state: request.state,
      })),
    },
    network: {
      fetch: vi.fn(),
    },
    notifications: {
      show: vi.fn(async () => undefined),
    },
    scheduler: {
      cancel: vi.fn(),
      list: vi.fn(),
      schedule: vi.fn(),
    },
  };
}

describe('link menuActions', () => {
  const actions = linkCanvasType.menuActions ?? [];

  it('opens, copies, refetches, and edits the URL', async () => {
    const host = createMockHost();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const state = {
      color: '#FFFFFF',
      title: 'Example',
      url: 'https://example.com',
    };

    await actions
      .find((action) => action.id === 'open-link')
      ?.run({ host, nodeId: 'n1', state });
    expect(host.external.openUrl).toHaveBeenCalledWith('https://example.com');

    actions
      .find((action) => action.id === 'copy-url')
      ?.run({ host, nodeId: 'n1', state });
    expect(writeText).toHaveBeenCalledWith('https://example.com');

    await actions
      .find((action) => action.id === 'refetch-link')
      ?.run({ host, nodeId: 'n1', state });
    expect(host.instance.updateState).toHaveBeenCalledWith({
      history: 'record',
      state: {
        ...state,
        unfurlStatus: 'idle',
        unfurlError: undefined,
      },
    });

    await actions
      .find((action) => action.id === 'edit-url')
      ?.run({ host, nodeId: 'n1', state });
    expect(host.canvas.openDetail).toHaveBeenCalled();
  });

  it('hides url actions when the url is empty', () => {
    const state = { color: '#FFFFFF', title: '', url: '' };
    expect(
      actions.find((action) => action.id === 'open-link')?.visible?.(state)
    ).toBe(false);
    expect(
      actions.find((action) => action.id === 'edit-url')?.visible
    ).toBeUndefined();
  });
});

describe('media menuActions', () => {
  it('replaces an image through importFile and updateState', async () => {
    const host = createMockHost();
    await imageMenuActions
      .find((action) => action.id === 'replace-image')
      ?.run({
        host,
        nodeId: 'n1',
        state: { color: '#FFFFFF', title: 'Keep', imageFile: 'old.png' },
      });
    expect(host.assets.importFile).toHaveBeenCalledWith({ accept: 'image/*' });
    expect(host.instance.updateState).toHaveBeenCalledWith({
      history: 'record',
      state: {
        color: '#FFFFFF',
        imageFile: 'attachments/photo.png',
        thumbnailFile: 'attachments/thumb.png',
        title: 'Keep',
      },
    });
  });

  it('copies the image file path and reveals it', async () => {
    const host = createMockHost();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const state = {
      color: '#FFFFFF',
      imageFile: 'attachments/pic.png',
      title: 'Pic',
    };
    imageMenuActions
      .find((action) => action.id === 'copy-image-address')
      ?.run({ host, nodeId: 'n1', state });
    expect(writeText).toHaveBeenCalledWith('attachments/pic.png');

    await imageMenuActions
      .find((action) => action.id === 'reveal-in-finder')
      ?.run({ host, nodeId: 'n1', state });
    expect(host.assets.reveal).toHaveBeenCalledWith('attachments/pic.png');
  });

  it('replaces a file and requests a title edit', async () => {
    const host = createMockHost();
    vi.mocked(host.assets.getMetadata).mockResolvedValue({
      mimeType: 'application/pdf',
      name: 'doc.pdf',
      size: 40,
      kind: 'file',
    });
    vi.mocked(host.assets.importFile).mockResolvedValue({
      id: 'attachments/doc.pdf',
    });
    await fileMenuActions
      .find((action) => action.id === 'replace-file')
      ?.run({
        host,
        nodeId: 'n1',
        state: {
          color: '#FFFFFF',
          fileName: 'old.pdf',
          kind: 'file',
          mimeType: 'application/pdf',
          title: 'Old',
        },
      });
    expect(host.instance.updateState).toHaveBeenCalledWith({
      history: 'record',
      state: {
        attachmentFile: 'attachments/doc.pdf',
        color: '#FFFFFF',
        fileName: 'doc.pdf',
        kind: 'file',
        mimeType: 'application/pdf',
        size: 40,
        title: 'doc.pdf',
      },
    });

    await recordingMenuActions
      .find((action) => action.id === 'rename-asset')
      ?.run({
        host,
        nodeId: 'n1',
        state: {
          color: '#FFFFFF',
          fileName: 'rec.wav',
          mimeType: 'audio/wav',
          recordingNumber: 1,
          title: '',
        },
      });
    expect(host.canvas.requestTitleEdit).toHaveBeenCalled();
  });
});
