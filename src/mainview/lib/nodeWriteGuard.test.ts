import type { Node } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyIfNodeUnchanged,
  captureNodeData,
  isNodeDataUnchanged,
} from '@/lib/nodeWriteGuard';
import { useCanvasStore } from '@/store/canvasStore';

const imageNode = (data: Record<string, unknown>): Node => ({
  id: 'img-1',
  type: 'image',
  position: { x: 0, y: 0 },
  data: { color: '#FFFFFF', ...data },
});

const liveData = () =>
  useCanvasStore.getState().nodes.find((n) => n.id === 'img-1')?.data;

describe('nodeWriteGuard (async write-back integrity)', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    useCanvasStore.setState({ nodes: [imageNode({ imageUrl: 'data:old' })] });
  });

  it('applies the patch when the node and pinned fields are unchanged', () => {
    const expectation = captureNodeData(
      useCanvasStore.getState().nodes,
      'img-1',
      ['imageUrl']
    );
    expect(expectation).not.toBeNull();
    // An unrelated field edit must not block the write-back.
    useCanvasStore.getState().updateNodeData('img-1', { title: 'renamed' });
    const applied = applyIfNodeUnchanged(useCanvasStore, expectation!, {
      imageFile: 'attachments/a.png',
    });
    expect(applied).toBe(true);
    expect(liveData()).toMatchObject({
      imageFile: 'attachments/a.png',
      title: 'renamed',
    });
  });

  it('drops the write when the node was deleted during the await', () => {
    const expectation = captureNodeData(
      useCanvasStore.getState().nodes,
      'img-1',
      ['imageUrl']
    )!;
    useCanvasStore.setState({ nodes: [] });
    expect(
      applyIfNodeUnchanged(useCanvasStore, expectation, { imageFile: 'x' })
    ).toBe(false);
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
  });

  it('drops the write after undo restores older image data', () => {
    const store = useCanvasStore.getState();
    store.commitNodeData('img-1', { imageUrl: 'data:new' });
    const expectation = captureNodeData(
      useCanvasStore.getState().nodes,
      'img-1',
      ['imageUrl']
    )!;
    expect(useCanvasStore.getState().undo()).toBe(true);
    expect(liveData()?.imageUrl).toBe('data:old');
    expect(
      applyIfNodeUnchanged(useCanvasStore, expectation, {
        imageFile: 'attachments/new.png',
      })
    ).toBe(false);
    expect(liveData()?.imageFile).toBeUndefined();
  });

  it('advances the expectation so chained writes in one flow still apply', () => {
    const expectation = captureNodeData(
      useCanvasStore.getState().nodes,
      'img-1',
      ['imageUrl', 'imageFile']
    )!;
    expect(
      applyIfNodeUnchanged(useCanvasStore, expectation, { imageFile: 'a.png' })
    ).toBe(true);
    expect(
      isNodeDataUnchanged(useCanvasStore.getState().nodes, expectation)
    ).toBe(true);
    expect(
      applyIfNodeUnchanged(useCanvasStore, expectation, { thumbnailFile: 't' })
    ).toBe(true);
  });

  it('returns null when capturing a missing node', () => {
    expect(captureNodeData([], 'nope', ['imageUrl'])).toBeNull();
  });
});
