---
title: "CSV importer"
description: "Turn a user-selected file into Notes through the host-owned select, map, preview, confirm and retry workflow."
section: guides
order: 40
---

An importer parses a file into Note previews. GhostBoard owns everything around it: the native file picker, field mapping, the immutable preview, confirmation, destination, retries, rollback and cleanup of the file handle. Your code never writes workspace content directly.

Scaffold with `bunx create-ghostboard-plugin my-importer --importer`.

## Register

```js
app.importers.register({
  id: 'notes-csv',
  title: 'Import Notes from CSV',
  accept: [{ description: 'CSV files', extensions: ['.csv'] }],

  async inspectFields(file, { signal }) {
    const text = await app.files.readText(file, { signal });
    const fields = parseHeader(text);
    const find = (name) => fields.find((f) => f.toLowerCase() === name) ?? null;
    return {
      fields,
      suggestedMapping: { title: find('title'), text: find('text'), color: find('color') },
    };
  },

  async parse(file, { mapping, signal }) {
    const text = await app.files.readText(file, { signal });
    return parseCsvToNotes(text, mapping); // { notes, warnings } or { segments, warnings }
  },
});
```

## The user's flow

1. The user picks **Import Notes from CSV** in the Plugin Workbench. If several importers accept the same extension, the host asks which one to use.
2. The host opens the native file picker and hands your importer an opaque, read-only file handle bound to this plugin, workspace, activation and process. You get `name`, `size`, `mimeType` and `lastModified`, never a path.
3. If you implemented `inspectFields`, the host shows a mapping UI for the fixed Note surface: required `title`, optional `text` and `color`. One source field cannot feed two targets; at most 100 unique fields are offered.
4. `parse` returns Notes and warnings. The host shows an immutable preview with counts, titles, body excerpts, colors and warnings. Nothing has been written yet; cancelling here writes nothing.
5. On confirm, the host creates the Notes as **detached** Notes (in the library, not on a canvas) in one atomic 1–100 item transaction with a stable operation ID. For a single batch the user may also choose to place the new Notes on the open canvas in a grid or column; creation and placement are separate operations, so a placement failure leaves the Notes created and retryable.
6. The result is recorded with a batch ID. The user can undo it from the plugin batch history; disabling or uninstalling the importer keeps the Notes.

## More than 100 rows

Return explicit segments instead of one list:

```js
return {
  segments: chunk(notes, 100).map((notes) => ({ notes })),
  warnings,
};
```

Allowed: 2–50 segments of 1–100 Notes each (101–5,000 Notes total). The host commits segments in order, shows the completed range, deduplicates retries by segment operation ID and resumes from the failed segment after a lost response. Rollback runs completed ranges in reverse; a range that the user has since edited or referenced is kept whole while the others are removed. Segmented imports always stay detached.

## Limits and rules

- `readText` is strict UTF-8 and defaults to 1 MiB (`maxBytes` up to 16 MiB); use `readBytes` or `stream` for binary or large files.
- The `text` you return is plain text split into paragraphs, not Markdown.
- Do not write workspace content, keep handles, or start background work in `inspectFields`/`parse`. Cancel promptly when `signal` aborts.
- Handles are released when the session ends, the plugin reloads or is disabled, or the workspace switches.

## Testing

```js
const fake = createFakeHost({ pluginId: 'yourname.csv', workspaceId: 'w1' });
await plugin.setup(fake.app);
const file = fake.harness.files.addText('notes.csv', 'title,text\nOne,Body', { mimeType: 'text/csv' });
const fields = await fake.harness.behavior.inspectImporterFields('notes-csv', file);
const preview = await fake.harness.behavior.parseImporter('notes-csv', file, {
  mapping: fields.suggestedMapping,
});
```
