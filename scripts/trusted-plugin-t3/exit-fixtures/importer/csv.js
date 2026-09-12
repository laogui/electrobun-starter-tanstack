const BOM_RE = /^\uFEFF/;
const LINE_BREAK_RE = /\r?\n/;

export function parseCsv(text) {
  const rows = text
    .replace(BOM_RE, '')
    .split(LINE_BREAK_RE)
    .filter((line) => line.trim())
    .map((line) => line.split(',').map((field) => field.trim()));
  if (rows.length < 2) {
    throw new Error('CSV requires a header and at least one note');
  }
  const fields = rows[0];
  if (
    fields.some((field) => !field) ||
    new Set(fields).size !== fields.length
  ) {
    throw new Error('CSV headers must be unique and non-empty');
  }
  return {
    fields,
    notes: rows.slice(1).map((row, index) => {
      const title = row[fields.indexOf('title')] ?? '';
      if (!title) {
        throw new Error(`CSV row ${index + 2} requires a title`);
      }
      return {
        title,
        ...(fields.includes('text')
          ? { text: row[fields.indexOf('text')] ?? '' }
          : {}),
      };
    }),
  };
}
