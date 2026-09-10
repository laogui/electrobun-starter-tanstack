import { beforeEach, expect, it, vi } from 'vitest';
import { createNoteBodySync, registerNoteBodyEditor } from './noteBodySync';

const load = vi.hoisted(() => vi.fn());
vi.mock('./rpc', () => ({ rpcLoadBlockNote: load }));
const change = {
  id: 'a',
  before: { title: 'Old', color: 'red', revision: 1 },
  after: { title: 'New', color: 'blue', revision: 2 },
  metadataOnly: false,
};
const response = (revision = 2) => ({
  success: true,
  workspaceId: 'workspace',
  revision,
  blocks: [{ type: 'paragraph', content: 'New body' }],
  text: 'New body',
  preview: {
    html: '<p>New body</p>',
    excerpt: 'New body',
    version: 1,
    blocks: 1,
  },
});
function setup() {
  const data = {
    noteId: 'a',
    title: 'Old',
    color: 'red',
    blocknoteRevision: 1,
    content: 'Old body',
  };
  let state = {
    nodes: [
      { data },
      { data: { children: [{ noteId: 'a', data: { ...data } }] } },
    ],
    focusedNode: { data: { ...data } },
    focusedFolder: null,
  };
  const sync = createNoteBodySync<typeof state>((apply) => {
    state = apply(state);
  });
  return { sync, get: () => state };
}
const drain = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
beforeEach(() => {
  load.mockReset();
});

it('refreshes placements, folder children and a clean open editor from one canonical read', async () => {
  const { sync, get } = setup();
  load.mockResolvedValue(response());
  const apply = vi.fn();
  const dispose = registerNoteBodyEditor(
    'a',
    { canApply: () => true, apply },
    'workspace'
  );
  try {
    sync.refresh('workspace', change);
    await drain();
    expect(load).toHaveBeenCalledWith('a', 'workspace');
    expect(apply).toHaveBeenCalledOnce();
    expect(get().nodes[0]?.data).toMatchObject({
      content: 'New body',
      title: 'New',
      blocknoteRevision: 2,
      previewHtml: '<p>New body</p>',
    });
    expect(get().nodes[1]?.data).toMatchObject({
      children: [{ data: { content: 'New body', blocknoteRevision: 2 } }],
    });
    expect(get().focusedNode.data.content).toBe('New body');
  } finally {
    dispose();
  }
});
it('rechecks dirty guards after the read and protects all copies of a draft', async () => {
  const { sync, get } = setup();
  let resolve!: (value: ReturnType<typeof response>) => void;
  load.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  let dirty = false;
  const apply = vi.fn();
  const dispose = registerNoteBodyEditor(
    'a',
    {
      canApply: () => !dirty,
      apply,
    },
    'workspace'
  );
  try {
    sync.refresh('workspace', change);
    dirty = true;
    resolve(response());
    await drain();
    expect(apply).not.toHaveBeenCalled();
    expect(get().nodes[0]?.data).toMatchObject({ content: 'Old body' });
  } finally {
    dispose();
  }
});
it('discards reads after reset and foreign workspace responses', async () => {
  const { sync, get } = setup();
  load.mockResolvedValue(response());
  sync.refresh('workspace', change);
  sync.reset();
  await drain();
  expect(get().nodes[0]?.data).toMatchObject({ content: 'Old body' });
  load.mockResolvedValue({ ...response(), workspaceId: 'other' });
  sync.refresh('workspace', change);
  await drain();
  expect(get().nodes[0]?.data).toMatchObject({ content: 'Old body' });
});
it('coalesces a body change followed by metadata and ignores its late older read', async () => {
  const { sync, get } = setup();
  let resolveOld!: (value: ReturnType<typeof response>) => void;
  load
    .mockReturnValueOnce(
      new Promise((done) => {
        resolveOld = done;
      })
    )
    .mockResolvedValueOnce(response(3));
  sync.refresh('workspace', change);
  sync.refresh('workspace', {
    ...change,
    before: change.after,
    after: { ...change.after, title: 'Newest', revision: 3 },
    metadataOnly: true,
  });
  await drain();
  resolveOld(response());
  await drain();
  expect(get().nodes[0]?.data).toMatchObject({
    title: 'Newest',
    blocknoteRevision: 3,
    content: 'New body',
  });
});
it('retains state on failed reads or a revision that does not match the event', async () => {
  const { sync, get } = setup();
  load
    .mockResolvedValueOnce({ success: false })
    .mockResolvedValueOnce(response(4));
  sync.refresh('workspace', change);
  await drain();
  sync.refresh('workspace', change);
  await drain();
  expect(get().nodes[0]?.data).toMatchObject({ content: 'Old body' });
});

it('does not refresh or consult an editor for the same note ID in a previous workspace', async () => {
  const { sync, get } = setup();
  load.mockResolvedValue(response());
  const canApply = vi.fn(() => false);
  const apply = vi.fn();
  const dispose = registerNoteBodyEditor(
    'a',
    { canApply, apply },
    'old-workspace'
  );
  try {
    sync.refresh('workspace', change);
    await drain();
    expect(canApply).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(get().nodes[0]?.data).toMatchObject({ content: 'New body' });
  } finally {
    dispose();
  }
});
