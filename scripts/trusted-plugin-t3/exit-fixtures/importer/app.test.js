import { afterEach, expect, test } from 'bun:test';
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin from './app.js';

let fake;

afterEach(async () => {
  await fake?.harness.lifecycle.dispose();
  fake = undefined;
  globalThis.__ghostboardT3Exit = undefined;
});

test('registers only the importer and previews CSV without writing', async () => {
  fake = createFakeHost({
    pluginId: 't3.exit.importer',
    workspaceId: 'test-workspace',
  });
  await plugin.setup(fake.app);
  expect(fake.harness.inspection.importers.map(({ id }) => id)).toEqual([
    'notes-csv',
  ]);
  expect(fake.harness.inspection.commands).toEqual([]);
  expect(fake.harness.inspection.panels).toEqual([]);
  expect(fake.harness.inspection.canvasTypes).toEqual([]);
  const file = fake.harness.files.addText(
    'notes.csv',
    'title,text\nIndependent,Package proof\n'
  );
  const preview = await fake.harness.behavior.parseImporter('notes-csv', file);
  expect(preview.notes).toEqual([
    { text: 'Package proof', title: 'Independent' },
  ]);
  expect((await fake.app.content.query()).items).toEqual([]);
});
