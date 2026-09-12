import { afterEach, expect, test } from 'bun:test';
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin from './app.js';
import { parseNotesCsv } from './csv.js';

let fake;

afterEach(async () => {
  await fake?.harness.lifecycle.dispose();
  fake = undefined;
  globalThis.__ghostboardT3Combined = undefined;
});

test('parses the bounded CSV contract', () => {
  expect(
    parseNotesCsv('title,text,color\n"One, quoted","Line 1\nLine 2",blue\n')
  ).toEqual({
    notes: [{ color: 'blue', text: 'Line 1\nLine 2', title: 'One, quoted' }],
    warnings: [],
  });
  expect(() => parseNotesCsv('text\nMissing title')).toThrow(
    'requires a title column'
  );
  expect(() =>
    parseNotesCsv(
      `title\n${Array.from({ length: 101 }, (_, index) => `Note ${index}`).join('\n')}`
    )
  ).toThrow('more than 100 notes');
});

test('registers four contribution types and previews without writing', async () => {
  fake = createFakeHost({
    pluginId: 't3.combined',
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
    'import-counter',
  ]);
  expect(fake.harness.inspection.importers.map(({ id }) => id)).toEqual([
    'notes-csv',
  ]);

  const file = fake.harness.files.addText(
    'notes.csv',
    'title,text,color\nFirst,Body,blue\nSecond,,\n',
    { mimeType: 'text/csv' }
  );
  const preview = await fake.harness.behavior.parseImporter('notes-csv', file);
  expect(preview.notes).toHaveLength(2);
  expect((await fake.app.content.query()).items).toEqual([]);
});
