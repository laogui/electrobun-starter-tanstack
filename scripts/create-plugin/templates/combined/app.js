import { definePlugin } from '@ghostboard/sdk';
import { createElement } from 'react';

function csvRows(text) {
  const rows = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  let row = [];
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character !== '"') {
        field += character;
        continue;
      }
      if (source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
        closedQuote = true;
      }
      continue;
    }
    if (character === '"') {
      if (field || closedQuote) {
        throw new Error(`Unexpected quote at character ${index + 1}`);
      }
      quoted = true;
      continue;
    }
    if (closedQuote && ![',', '\r', '\n'].includes(character)) {
      throw new Error(`Unexpected character after quote at ${index + 1}`);
    }
    if (character === ',') {
      row.push(field);
      field = '';
      closedQuote = false;
      continue;
    }
    if (character === '\r' || character === '\n') {
      if (character === '\r' && source[index + 1] === '\n') {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      field = '';
      closedQuote = false;
      row = [];
      continue;
    }
    field += character;
  }
  if (quoted) {
    throw new Error('CSV ended inside a quoted field');
  }
  if (field || row.length > 0 || closedQuote) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function inspectCsvFields(text) {
  const rows = csvRows(text);
  if (rows.length < 1) {
    throw new Error('CSV requires a header');
  }
  const fields = rows[0].map((header) => header.trim());
  if (fields.some((field) => !field)) {
    throw new Error('CSV headers must not be empty');
  }
  const normalized = fields.map((field) => field.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('CSV headers must not repeat');
  }
  return fields;
}

export function parseNotesCsv(text, mapping) {
  const rows = csvRows(text);
  if (rows.length < 2) {
    throw new Error('CSV requires a header and at least one note');
  }
  const fields = inspectCsvFields(text);
  const byLowercase = new Map(
    fields.map((field) => [field.toLowerCase(), field])
  );
  const selected = mapping ?? {
    color: byLowercase.get('color') ?? null,
    text: byLowercase.get('text') ?? null,
    title: byLowercase.get('title') ?? null,
  };
  if (!(selected.title && fields.includes(selected.title))) {
    throw new Error('CSV requires a mapped title column');
  }
  for (const value of [selected.text, selected.color]) {
    if (value !== null && !fields.includes(value)) {
      throw new Error('CSV mapping references an unavailable column');
    }
  }
  const titleIndex = fields.indexOf(selected.title);
  const textIndex = selected.text === null ? -1 : fields.indexOf(selected.text);
  const colorIndex =
    selected.color === null ? -1 : fields.indexOf(selected.color);
  const notes = [];
  for (const [rowOffset, row] of rows.slice(1).entries()) {
    if (row.every((value) => !value.trim())) {
      continue;
    }
    if (row.length > fields.length) {
      throw new Error(`CSV row ${rowOffset + 2} has too many fields`);
    }
    const title = row[titleIndex]?.trim() ?? '';
    if (!title) {
      throw new Error(`CSV row ${rowOffset + 2} requires a title`);
    }
    notes.push({
      title,
      ...(textIndex >= 0 ? { text: row[textIndex] ?? '' } : {}),
      ...(colorIndex >= 0 ? { color: row[colorIndex]?.trim() ?? '' } : {}),
    });
    if (notes.length > 5000) {
      throw new Error('CSV contains more than 5,000 notes');
    }
  }
  if (notes.length === 0) {
    throw new Error('CSV contains no notes');
  }
  if (notes.length <= 100) {
    return { notes, warnings: [] };
  }
  return {
    segments: Array.from(
      { length: Math.ceil(notes.length / 100) },
      (_, index) => ({ notes: notes.slice(index * 100, (index + 1) * 100) })
    ),
    warnings: [],
  };
}

function HelpPanel() {
  return createElement(
    'section',
    null,
    createElement('strong', null, 'CSV Note importer'),
    createElement(
      'p',
      null,
      'Use Import Notes from CSV in the Plugin Workbench to choose a file.'
    )
  );
}

function CounterCard({ context, state, updateState }) {
  return createElement(
    'button',
    {
      disabled: context.readOnly,
      onClick: () => updateState({ count: state.count + 1 }),
      type: 'button',
    },
    `Count: ${state.count}`
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
      component: HelpPanel,
      id: 'import-help',
      title: 'CSV import help',
    });
    app.canvas.registerType({
      component: CounterCard,
      createInitialState: () => ({ count: 0 }),
      dataVersion: 1,
      id: 'counter',
      summarize: (state) => ({
        plainText: `Counter value ${state.count}`,
        title: `Counter: ${state.count}`,
      }),
      title: 'Counter',
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
        return parseNotesCsv(text, mapping);
      },
      title: 'Import Notes from CSV',
    });
  },
});
