import { afterEach, expect, test } from 'bun:test';
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin from './app.js';

let fake;

afterEach(async () => {
  await fake?.harness.lifecycle.dispose();
  fake = undefined;
  globalThis.__ghostboardT3Exit = undefined;
});

test('registers and runs only the command contribution', async () => {
  fake = createFakeHost({
    pluginId: 't3.exit.command',
    workspaceId: 'test-workspace',
  });
  await plugin.setup(fake.app);
  expect(fake.harness.inspection.commands.map(({ id }) => id)).toEqual([
    'record',
  ]);
  expect(fake.harness.inspection.panels).toEqual([]);
  expect(fake.harness.inspection.canvasTypes).toEqual([]);
  expect(fake.harness.inspection.importers).toEqual([]);
  await fake.harness.behavior.runCommand('record');
  expect(globalThis.__ghostboardT3Exit.commandRuns).toBe(1);
});
