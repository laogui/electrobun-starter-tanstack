import { afterEach, expect, test } from 'bun:test';
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin from './app';

let fake: ReturnType<typeof createFakeHost> | undefined;

afterEach(async () => {
  await fake?.harness.lifecycle.dispose();
  fake = undefined;
});

test('registers and runs the React plugin without GhostBoard', async () => {
  fake = createFakeHost({
    pluginId: 'example.react-hello',
    workspaceId: 'test-workspace',
  });
  await plugin.setup(fake.app);

  expect(fake.harness.inspection.commands.map(({ id }) => id)).toEqual([
    'open-hello',
  ]);
  expect(fake.harness.inspection.panels.map(({ id }) => id)).toEqual(['hello']);
  await fake.harness.behavior.runCommand('open-hello');
  expect(fake.harness.inspection.openPanels).toEqual(['hello']);
});
