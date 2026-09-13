import { afterEach, expect, test } from 'bun:test';
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin from './app.js';
import { inspectCsvFields, parseNotesCsv } from './csv.js';

let fake;

afterEach(async () => {
  await fake?.harness.lifecycle.dispose();
  fake = undefined;
});

test('maps and segments the bounded CSV format', () => {
  expect(inspectCsvFields('Heading,Copy,Tint\nOne,Body,blue')).toEqual([
    'Heading',
    'Copy',
    'Tint',
  ]);
  expect(
    parseNotesCsv('Heading,Copy,Tint\nOne,Body,blue', {
      color: 'Tint',
      text: 'Copy',
      title: 'Heading',
    })
  ).toEqual({
    notes: [{ color: 'blue', text: 'Body', title: 'One' }],
    warnings: [],
  });
  const segmented = parseNotesCsv(
    `title\n${Array.from({ length: 205 }, (_, index) => `Note ${index}`).join('\n')}`
  );
  expect(segmented.segments.map((segment) => segment.notes.length)).toEqual([
    100, 100, 5,
  ]);
});

test('registers an importer and produces preview data without writing', async () => {
  fake = createFakeHost({
    pluginId: 'example.csv-importer',
    workspaceId: 'test-workspace',
  });
  await plugin.setup(fake.app);

  expect(fake.harness.inspection.importers.map(({ id }) => id)).toEqual([
    'notes-csv',
  ]);
  const file = fake.harness.files.addText(
    'notes.csv',
    'title,text,color\nFirst,Body,blue\nSecond,,\n',
    { mimeType: 'text/csv' }
  );
  const inspection = await fake.harness.behavior.inspectImporterFields(
    'notes-csv',
    file
  );
  const preview = await fake.harness.behavior.parseImporter('notes-csv', file, {
    mapping: inspection.suggestedMapping,
  });
  expect(preview.notes).toHaveLength(2);
  expect((await fake.app.content.query()).items).toEqual([]);
});
