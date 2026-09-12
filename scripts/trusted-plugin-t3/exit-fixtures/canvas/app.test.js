import { afterEach, expect, test } from 'bun:test';
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin from './app.js';

let fake;

afterEach(async () => {
  await fake?.harness.lifecycle.dispose();
  fake = undefined;
  globalThis.__ghostboardT3Exit = undefined;
});

test('registers only the canvas contribution', async () => {
  fake = createFakeHost({
    pluginId: 't3.exit.canvas',
    workspaceId: 'test-workspace',
  });
  await plugin.setup(fake.app);
  expect(fake.harness.inspection.canvasTypes.map(({ id }) => id)).toEqual([
    'counter',
  ]);
  expect(fake.harness.inspection.commands).toEqual([]);
  expect(fake.harness.inspection.panels).toEqual([]);
  expect(fake.harness.inspection.importers).toEqual([]);
});
