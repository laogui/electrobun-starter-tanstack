import { afterEach, expect, test } from 'bun:test';
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin from './app.js';

let fake;

afterEach(async () => {
  await fake?.harness.lifecycle.dispose();
  fake = undefined;
});

test('registers and runs the Hello plugin without GhostBoard', async () => {
  fake = createFakeHost({
    pluginId: 'example.hello',
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
