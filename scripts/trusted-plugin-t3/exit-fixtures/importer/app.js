import { definePlugin } from '@ghostboard/sdk';
import { parseCsv } from './csv.js';

const evidence = (globalThis.__ghostboardT3Exit ??= {
  apps: {},
  commandRuns: 0,
});

export default definePlugin({
  setup(app) {
    evidence.apps.importer = app;
    app.importers.register({
      accept: [{ description: 'CSV files', extensions: ['.csv'] }],
      id: 'notes-csv',
      async inspectFields(file, { signal }) {
        const { fields } = parseCsv(await app.files.readText(file, { signal }));
        return {
          fields,
          suggestedMapping: {
            color: null,
            text: fields.includes('text') ? 'text' : null,
            title: fields.includes('title') ? 'title' : null,
          },
        };
      },
      async parse(file, { signal }) {
        const { notes } = parseCsv(await app.files.readText(file, { signal }));
        return { notes, warnings: [] };
      },
      title: 'Import independent CSV',
    });
  },
});
