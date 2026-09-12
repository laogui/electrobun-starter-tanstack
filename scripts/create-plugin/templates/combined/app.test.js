import { afterEach, expect, test } from 'bun:test';
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin, { parseNotesCsv } from './app.js';

let fake;

afterEach(async () => {
  await fake?.harness.lifecycle.dispose();
  fake = undefined;
});

test('registers all four public contribution types', async () => {
  fake = createFakeHost({
    pluginId: 'example.combined',
    workspaceId: 'test-workspace',
  });
  await plugin.setup(fake.app);

  expect(fake.harness.inspection.commands.map(({ id }) => id)).toEqual([
    'open-import-help',
  ]);
  expect(fake.harness.inspection.panels.map(({ id }) => id)).toEqual([
    'import-help',
  ]);
  expect(fake.harness.inspection.canvasTypes.map(({ id }) => id)).toEqual([
    'counter',
  ]);
  expect(fake.harness.inspection.importers.map(({ id }) => id)).toEqual([
    'notes-csv',
  ]);
  await fake.harness.behavior.runCommand('open-import-help');
  expect(fake.harness.inspection.openPanels).toEqual(['import-help']);
});

test('previews mapped and segmented CSV without writing', async () => {
  fake = createFakeHost({
    pluginId: 'example.combined',
    workspaceId: 'test-workspace',
  });
  await plugin.setup(fake.app);
  const file = fake.harness.files.addText(
    'notes.csv',
    'Heading,Copy,Tint\nOne,Body,blue',
    { mimeType: 'text/csv' }
  );
  const preview = await fake.harness.behavior.parseImporter('notes-csv', file, {
    mapping: { color: 'Tint', text: 'Copy', title: 'Heading' },
  });
  expect(preview.notes).toEqual([
    { color: 'blue', text: 'Body', title: 'One' },
  ]);
  expect((await fake.app.content.query()).items).toEqual([]);

  const segmented = parseNotesCsv(
    `title\n${Array.from({ length: 101 }, (_, index) => `Note ${index}`).join('\n')}`
  );
  expect(segmented.segments.map(({ notes }) => notes.length)).toEqual([100, 1]);
});
