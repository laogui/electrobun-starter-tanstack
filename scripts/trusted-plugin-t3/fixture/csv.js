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

export function parseNotesCsv(text) {
  const rows = csvRows(text);
  if (rows.length < 2) {
    throw new Error('CSV requires a header and at least one note');
  }
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  if (headers.some((header) => !['title', 'text', 'color'].includes(header))) {
    throw new Error('CSV supports only title, text and color columns');
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error('CSV headers must not repeat');
  }
  const titleIndex = headers.indexOf('title');
  if (titleIndex < 0) {
    throw new Error('CSV requires a title column');
  }
  const textIndex = headers.indexOf('text');
  const colorIndex = headers.indexOf('color');
  const notes = [];
  let skipped = 0;
  for (const [rowOffset, row] of rows.slice(1).entries()) {
    if (row.every((field) => !field.trim())) {
      skipped += 1;
      continue;
    }
    if (row.length > headers.length) {
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
    if (notes.length > 100) {
      throw new Error('CSV contains more than 100 notes');
    }
  }
  if (notes.length === 0) {
    throw new Error('CSV contains no notes');
  }
  return {
    notes,
    warnings: skipped > 0 ? [`Skipped ${skipped} empty row(s)`] : [],
  };
}
