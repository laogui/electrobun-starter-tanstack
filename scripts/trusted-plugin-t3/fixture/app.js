import { definePlugin } from '@ghostboard/sdk';
import { createElement } from 'react';
import { inspectCsvFields, parseNotesCsv } from './csv.js';

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
        if (text.includes('__WAIT__')) {
          await new Promise((resolve, reject) => {
            const abort = () =>
              reject(new DOMException('Probe parse aborted', 'AbortError'));
            signal.addEventListener('abort', abort, { once: true });
            setTimeout(resolve, 60_000);
          });
        }
        return parseNotesCsv(text, mapping);
      },
      title: 'Import notes from CSV',
    });
    globalThis.__ghostboardT3Combined = Object.freeze({ app });
  },
});
