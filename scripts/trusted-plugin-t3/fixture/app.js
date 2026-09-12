import { definePlugin } from '@ghostboard/sdk';
import { createElement } from 'react';
import { parseNotesCsv } from './csv.js';

function ImportPanel() {
  return createElement(
    'section',
    { 'data-t3-combined-panel': true },
    createElement('strong', null, 'CSV note importer'),
    createElement(
      'p',
      null,
      'Use Import notes from CSV in the Plugin Workbench to preview a file.'
    )
  );
}

function CounterCard({ context, state, updateState }) {
  return createElement(
    'button',
    {
      'data-t3-combined-card': true,
      disabled: context.readOnly,
      onClick: () => updateState({ count: state.count + 1 }),
      type: 'button',
    },
    `Imported helper count: ${state.count}`
  );
}

export default definePlugin({
  setup(app) {
    app.commands.register({
      id: 'open-import-help',
      run: () => app.panels.open('import-help'),
      title: 'Open CSV import help',
    });
    app.panels.register({
      component: ImportPanel,
      id: 'import-help',
      title: 'CSV import help',
    });
    app.canvas.registerType({
      component: CounterCard,
      createInitialState: () => ({ count: 0 }),
      dataVersion: 1,
      id: 'import-counter',
      summarize: (state) => ({
        plainText: `Imported helper count ${state.count}`,
        title: `Import counter: ${state.count}`,
      }),
      title: 'Import counter',
      validateState: (state) =>
        Boolean(
          state &&
            typeof state === 'object' &&
            !Array.isArray(state) &&
            typeof state.count === 'number'
        ),
    });
    app.importers.register({
      accept: [{ description: 'CSV files', extensions: ['.csv'] }],
      id: 'notes-csv',
      async parse(file, { signal }) {
        return parseNotesCsv(await app.files.readText(file, { signal }));
      },
      title: 'Import notes from CSV',
    });
    globalThis.__ghostboardT3Combined = Object.freeze({ app });
  },
});
