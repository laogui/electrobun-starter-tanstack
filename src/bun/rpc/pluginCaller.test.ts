import { expect, it, vi } from 'vitest';
import type { RpcContext } from './context';

const native = vi.hoisted(() => ({ pick: vi.fn(async () => []) }));
vi.mock('electrobun/bun', () => ({
  Utils: {
    paths: { userData: '/mock-user-data' },
    openFileDialog: native.pick,
  },
}));
const { createPluginsHandlers } = await import('./handlers/plugins');
const { createAttachmentsHandlers } = await import('./handlers/attachments');
const { PluginFileStore } = await import('../plugins/files');
it('does not expose absolute source-file reads on the renderer attachment bridge', () => {
  expect(
    createAttachmentsHandlers({ wsPath: '/unused' } as RpcContext)
  ).not.toHaveProperty('saveAttachmentFile');
});
it('rejects a forged picker plugin ID before prompting or opening a native picker', async () => {
  const check = vi.fn(async () => true);
  const handlers = createPluginsHandlers({
    pluginFiles: new PluginFileStore('workspace'),
    pluginPermissions: { check },
    resolvePluginCaller: (token: string) =>
      token === 'valid-token' ? 'community.real' : null,
  } as unknown as RpcContext);
  const params = {
    workspaceId: 'workspace',
    activationId: crypto.randomUUID(),
    pluginId: 'community.forged',
    hostToken: 'valid-token',
    extensions: ['.txt'],
  };
  expect(await handlers.pluginFilesPick(params)).toMatchObject({
    success: false,
  });
  expect(check).not.toHaveBeenCalled();
  expect(native.pick).not.toHaveBeenCalled();
  expect(
    await handlers.pluginFilesPick({ ...params, pluginId: 'community.real' })
  ).toMatchObject({ success: false, cancelled: true });
  expect(check).toHaveBeenCalledWith('community.real', 'files.read');
  expect(native.pick).toHaveBeenCalledOnce();
});
