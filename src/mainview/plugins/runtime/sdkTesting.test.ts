import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginEventMap } from '../../../../packages/plugin-sdk';
import { createFakeHost } from '../../../../packages/plugin-sdk/testing.js';

const hosts: ReturnType<typeof createFakeHost>[] = [];

function host() {
  const fake = createFakeHost({
    pluginId: 'example.testing',
    workspaceId: 'workspace-a',
  });
  hosts.push(fake);
  return fake;
}

afterEach(async () => {
  await Promise.all(
    hosts.splice(0).map((fake) => fake.harness.lifecycle.dispose())
  );
});

describe('@ghostboard/sdk/testing', () => {
  it('models binary files, directory listing, writes and explicit release', async () => {
    const { app, harness } = host();
    const input = harness.files.addBytes(
      'input.bin',
      Uint8Array.from([1, 2, 3])
    );
    const directory = harness.files.addDirectory('Exports');
    harness.files.queuePick(input);
    harness.files.queueDirectory(directory);

    await expect(
      app.files.pick({
        accept: [{ description: 'Binary', extensions: ['.bin'] }],
      })
    ).resolves.toEqual([input]);
    await expect(app.files.readBytes(input)).resolves.toEqual(
      Uint8Array.from([1, 2, 3])
    );
    await expect(app.files.pickDirectory()).resolves.toBe(directory);
    const output = await app.files.write(directory, 'result.txt', 'hello');
    const page = await app.files.list(directory);
    expect(page.entries).toEqual([
      { handle: output, kind: 'file', name: 'result.txt' },
    ]);
    app.files.release(input, output, directory);
    await expect(app.files.readBytes(input)).rejects.toThrow('unavailable');
  });

  it('inspects registrations and drives commands, events and activation abort', async () => {
    const { app, harness } = host();
    const run = vi.fn();
    const changed = vi.fn();
    const cleanup = vi.fn();
    app.commands.register({ id: 'run', run, title: 'Run' });
    app.panels.register({
      id: 'panel',
      mount: () => undefined,
      title: 'Panel',
    });
    app.events.on('content.changed', changed);
    app.onCleanup(cleanup);

    expect(harness.inspection.commands.map(({ id }) => id)).toEqual(['run']);
    expect(harness.inspection.panels.map(({ id }) => id)).toEqual(['panel']);
    expect(harness.inspection.cleanupCount).toBe(4);
    await harness.behavior.runCommand('run');
    const event: PluginEventMap['content.changed'] = {
      ids: ['note-1'],
      kind: 'note',
      operation: 'upsert',
      workspaceId: 'workspace-a',
    };
    await harness.behavior.emit('content.changed', event);

    expect(run).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledWith(event);
    const signal = app.signal;
    await harness.behavior.abort();
    expect(signal.aborted).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
    await expect(harness.behavior.runCommand('run')).rejects.toThrow(
      'activation is inactive'
    );
  });

  it('keeps the old activation on failed reload and swaps it atomically on success', async () => {
    const { app, harness } = host();
    app.commands.register({ id: 'old', run: () => undefined, title: 'Old' });
    const oldSignal = app.signal;
    const failedCleanup = vi.fn();

    await expect(
      harness.lifecycle.reload((candidate) => {
        candidate.commands.register({
          id: 'candidate',
          run: () => undefined,
          title: 'Candidate',
        });
        candidate.onCleanup(failedCleanup);
        throw new Error('candidate failed');
      })
    ).rejects.toThrow('candidate failed');

    expect(oldSignal.aborted).toBe(false);
    expect(failedCleanup).toHaveBeenCalledOnce();
    expect(harness.inspection.commands.map(({ id }) => id)).toEqual(['old']);
    expect(harness.inspection.generation).toBe(1);

    const nextApp = await harness.lifecycle.reload(async (candidate) => {
      await Promise.resolve();
      candidate.commands.register({
        id: 'next',
        run: () => undefined,
        title: 'Next',
      });
    });

    expect(oldSignal.aborted).toBe(true);
    expect(nextApp.generation).toBe(3);
    expect(harness.inspection.generation).toBe(3);
    expect(harness.inspection.commands.map(({ id }) => id)).toEqual(['next']);
  });

  it('parses an in-memory file and deduplicates fake content operations', async () => {
    const { app, harness } = host();
    app.importers.register({
      accept: [{ description: 'CSV files', extensions: ['.csv'] }],
      id: 'csv',
      async parse(file) {
        const text = await app.files.readText(file);
        const [, row] = text.trim().split('\n');
        const [title, body] = row!.split(',');
        return { notes: [{ text: body, title: title! }], warnings: [] };
      },
      title: 'CSV',
    });
    const file = harness.files.addText('notes.csv', 'title,text\nOne,Body', {
      mimeType: 'text/csv',
    });

    const preview = await harness.behavior.parseImporter('csv', file);
    expect(preview).toEqual({
      notes: [{ text: 'Body', title: 'One' }],
      warnings: [],
    });
    const first = await app.content.createMany([...preview.notes], {
      label: 'Import',
      operationId: 'stable-import',
    });
    const retry = await app.content.createMany([...preview.notes], {
      label: 'Import',
      operationId: 'stable-import',
    });

    expect(retry).toEqual(first);
    expect((await app.content.query()).items).toHaveLength(1);
  });
});
