import { definePlugin } from '@ghostboard/sdk';
import { inspectCsvFields, parseNotesCsv } from './csv.js';

export default definePlugin({
  setup(app) {
    app.importers.register({
      accept: [{ description: 'CSV files', extensions: ['.csv'] }],
      id: 'notes-csv',
      async inspectFields(file, { signal }) {
        const text = await app.files.readText(file, { signal });
        const fields = inspectCsvFields(text);
        const byLowercase = new Map(
          fields.map((field) => [field.toLowerCase(), field])
        );
        return {
          fields,
          suggestedMapping: {
            color: byLowercase.get('color') ?? null,
            text: byLowercase.get('text') ?? null,
            title: byLowercase.get('title') ?? null,
          },
        };
      },
      async parse(file, { mapping, signal }) {
        const text = await app.files.readText(file, { signal });
        return parseNotesCsv(text, mapping);
      },
      title: 'Import Notes from CSV',
    });
  },
});
