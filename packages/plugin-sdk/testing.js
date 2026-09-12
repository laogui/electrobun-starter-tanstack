const PATH_SEGMENT_RE = /[\\/]/;

function abortError(message = 'Fake host activation is inactive') {
  return new DOMException(message, 'AbortError');
}

function assertActive(activation) {
  if (!activation.active || activation.controller.signal.aborted) {
    throw abortError();
  }
}

function clone(value) {
  return structuredClone(value);
}

function trackedDisposer(activation, cleanup) {
  let active = true;
  const dispose = async () => {
    if (!active) {
      return;
    }
    active = false;
    activation.cleanups.delete(dispose);
    await cleanup();
  };
  activation.cleanups.add(dispose);
  return dispose;
}

function register(activation, collection, definition, kind) {
  assertActive(activation);
  if (
    !definition ||
    typeof definition.id !== 'string' ||
    !definition.id.trim() ||
    typeof definition.title !== 'string' ||
    !definition.title.trim()
  ) {
    throw new Error(`${kind} requires a nonempty id and title`);
  }
  if (collection.has(definition.id)) {
    throw new Error(`Duplicate ${kind.toLowerCase()} id: ${definition.id}`);
  }
  const registration = Object.freeze({ ...definition });
  collection.set(registration.id, registration);
  return trackedDisposer(activation, () => {
    if (collection.get(registration.id) === registration) {
      collection.delete(registration.id);
    }
  });
}

function selectionStore(activation, shared) {
  return Object.freeze({
    async get(options) {
      assertActive(activation);
      if (options?.signal?.aborted) {
        throw abortError('Selection read aborted');
      }
      return clone(shared.selection.items);
    },
    getPlacements() {
      assertActive(activation);
      return clone(shared.selection.placements);
    },
    getSnapshot() {
      return shared.selection;
    },
    subscribe(listener) {
      assertActive(activation);
      activation.selectionListeners.add(listener);
      return () => activation.selectionListeners.delete(listener);
    },
  });
}

function storageStore(activation, values) {
  return Object.freeze({
    async delete(key, options) {
      assertActive(activation);
      if (options?.signal?.aborted) {
        throw abortError('Storage operation aborted');
      }
      values.delete(key);
    },
    async get(key, options) {
      assertActive(activation);
      if (options?.signal?.aborted) {
        throw abortError('Storage operation aborted');
      }
      return values.has(key) ? clone(values.get(key)) : undefined;
    },
    async list(prefix, options) {
      assertActive(activation);
      if (options?.signal?.aborted) {
        throw abortError('Storage operation aborted');
      }
      const normalizedPrefix = prefix ?? '';
      return [...values.keys()]
        .filter((key) => key.startsWith(normalizedPrefix))
        .sort();
    },
    async set(key, value, options) {
      assertActive(activation);
      if (options?.signal?.aborted) {
        throw abortError('Storage operation aborted');
      }
      values.set(key, clone(value));
    },
  });
}

function contentStore(activation, shared) {
  const mutate = async (input, options, perform) => {
    assertActive(activation);
    if (options?.signal?.aborted) {
      throw abortError('Content operation aborted');
    }
    const operationId = options?.operationId ?? crypto.randomUUID();
    const fingerprint = JSON.stringify(input);
    const prior = shared.receipts.get(operationId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        throw new Error('Operation ID was reused with different input');
      }
      return clone(prior.result);
    }
    const result = await perform(operationId);
    shared.receipts.set(operationId, { fingerprint, result: clone(result) });
    return result;
  };
  return Object.freeze({
    createMany(notes, options) {
      return mutate({ action: 'create', notes }, options, (operationId) => {
        const items = notes.map((note) => {
          const id = `fake-note-${++shared.noteSequence}`;
          const item = {
            color: note.color ?? '',
            id,
            kind: 'note',
            revision: 1,
            source: 'sidecar',
            text: note.text ?? '',
            title: note.title,
          };
          shared.notes.set(id, item);
          return item;
        });
        return {
          changed: items.length > 0,
          items: items.map(({ color, id, revision, title }) => ({
            color,
            id,
            revision,
            title,
          })),
          operationId,
        };
      });
    },
    async get(id, options) {
      assertActive(activation);
      if (options?.signal?.aborted) {
        throw abortError('Content read aborted');
      }
      return shared.notes.has(id) ? clone(shared.notes.get(id)) : null;
    },
    async getMany(ids, options) {
      assertActive(activation);
      if (options?.signal?.aborted) {
        throw abortError('Content read aborted');
      }
      return ids.map((id) =>
        shared.notes.has(id) ? clone(shared.notes.get(id)) : null
      );
    },
    async query(query, options) {
      assertActive(activation);
      if (options?.signal?.aborted) {
        throw abortError('Content read aborted');
      }
      const needle = query?.text?.toLocaleLowerCase() ?? '';
      const limit = query?.limit ?? 100;
      return {
        items: [...shared.notes.values()]
          .filter(
            (item) =>
              !needle ||
              item.title.toLocaleLowerCase().includes(needle) ||
              item.text.toLocaleLowerCase().includes(needle)
          )
          .slice(0, limit)
          .map(clone),
        nextCursor: null,
      };
    },
    redo(batchId, options) {
      return mutate({ action: 'redo', batchId }, options, (operationId) => ({
        changed: false,
        items: [],
        operationId,
      }));
    },
    undo(batchId, options) {
      return mutate({ action: 'undo', batchId }, options, (operationId) => ({
        changed: false,
        items: [],
        operationId,
      }));
    },
    updateMany(updates, options) {
      return mutate({ action: 'update', updates }, options, (operationId) => {
        const items = updates.map((update) => {
          const current = shared.notes.get(update.id);
          if (!current || current.revision !== update.expectedRevision) {
            throw new Error(`Fake note revision conflict: ${update.id}`);
          }
          const next = {
            ...current,
            ...update.changes,
            revision: current.revision + 1,
          };
          shared.notes.set(update.id, next);
          return {
            color: next.color,
            id: next.id,
            revision: next.revision,
            title: next.title,
          };
        });
        return { changed: items.length > 0, items, operationId };
      });
    },
  });
}

function filesStore(activation) {
  const fileFor = (handle) => {
    const file = activation.files.get(handle.id);
    if (!file || file.handle !== handle) {
      throw new Error('Fake file handle is unavailable in this activation');
    }
    return file;
  };
  const directoryFor = (handle) => {
    const directory = activation.directories.get(handle.id);
    if (!directory || directory.handle !== handle) {
      throw new Error(
        'Fake directory handle is unavailable in this activation'
      );
    }
    return directory;
  };
  return Object.freeze({
    async pick(options) {
      assertActive(activation);
      if (options.signal?.aborted) {
        throw abortError('File pick aborted');
      }
      const picked = activation.queuedFiles.splice(0);
      const count = options.multiple ? 16 : 1;
      return picked.slice(0, count).map(({ handle }) => handle);
    },
    async pickDirectory(options = {}) {
      assertActive(activation);
      if (options.signal?.aborted) {
        throw abortError('Directory pick aborted');
      }
      return activation.queuedDirectories.shift()?.handle ?? null;
    },
    async list(handle, options = {}) {
      assertActive(activation);
      if (options.signal?.aborted) {
        throw abortError('Directory list aborted');
      }
      const directory = directoryFor(handle);
      const entries = [...directory.children.values()].sort((left, right) =>
        left.name.localeCompare(right.name)
      );
      const offset = Number(options.cursor ?? 0);
      const limit = options.limit ?? 100;
      return Object.freeze({
        entries: Object.freeze(entries.slice(offset, offset + limit)),
        nextCursor:
          offset + limit < entries.length ? String(offset + limit) : null,
      });
    },
    async readBytes(handle, options = {}) {
      assertActive(activation);
      if (options.signal?.aborted) {
        throw abortError('File read aborted');
      }
      const file = fileFor(handle);
      const start = options.start ?? 0;
      const length = options.length ?? file.bytes.byteLength - start;
      const bytes = file.bytes.slice(start, start + length);
      if (bytes.byteLength > (options.maxBytes ?? 16 * 1024 * 1024)) {
        throw new Error('Fake file read exceeds maxBytes');
      }
      options.onProgress?.({
        loaded: bytes.byteLength,
        total: bytes.byteLength,
      });
      return bytes;
    },
    stream(handle, options = {}) {
      const files = this;
      return new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(await files.readBytes(handle, options));
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });
    },
    async readText(handle, options) {
      assertActive(activation);
      if (options?.signal?.aborted) {
        throw abortError('File read aborted');
      }
      const file = fileFor(handle);
      return new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    },
    async write(directoryHandle, relativePath, data, options = {}) {
      assertActive(activation);
      if (options.signal?.aborted) {
        throw abortError('File write aborted');
      }
      if (
        !relativePath ||
        relativePath
          .split(PATH_SEGMENT_RE)
          .some((part) => !part || part === '..')
      ) {
        throw new Error('Fake file output path must be relative');
      }
      const directory = directoryFor(directoryHandle);
      if (directory.children.has(relativePath) && !options.overwrite) {
        throw new Error('Fake output file already exists');
      }
      const bytes =
        typeof data === 'string'
          ? new TextEncoder().encode(data)
          : data instanceof Uint8Array
            ? Uint8Array.from(data)
            : data instanceof ArrayBuffer
              ? new Uint8Array(data.slice(0))
              : new Uint8Array(await new Response(data).arrayBuffer());
      const handle = Object.freeze({
        id: crypto.randomUUID(),
        kind: 'file',
        lastModified: Date.now(),
        mimeType: 'application/octet-stream',
        name: relativePath.split(PATH_SEGMENT_RE).at(-1),
        size: bytes.byteLength,
      });
      const file = { bytes, handle };
      activation.files.set(handle.id, file);
      directory.children.set(
        relativePath,
        Object.freeze({ handle, kind: 'file', name: relativePath })
      );
      options.onProgress?.({
        loaded: bytes.byteLength,
        total: bytes.byteLength,
      });
      return handle;
    },
    release(...handles) {
      for (const handle of handles) {
        activation.files.delete(handle.id);
        activation.directories.delete(handle.id);
      }
    },
  });
}

function makeActivation(options, shared, generation) {
  const activation = {
    active: true,
    canvasTypes: new Map(),
    cleanups: new Set(),
    commands: new Map(),
    controller: new AbortController(),
    eventListeners: new Map(),
    directories: new Map(),
    files: new Map(),
    generation,
    importers: new Map(),
    openPanels: new Set(),
    panels: new Map(),
    queuedFiles: [],
    queuedDirectories: [],
    selectionListeners: new Set(),
    tasks: new Map(),
  };
  const selection = selectionStore(activation, shared);
  const app = {
    canvas: {
      registerType: (definition) =>
        register(activation, activation.canvasTypes, definition, 'Canvas type'),
    },
    commands: {
      register: (definition) => {
        if (typeof definition?.run !== 'function') {
          throw new Error('Command requires run()');
        }
        return register(activation, activation.commands, definition, 'Command');
      },
    },
    content: contentStore(activation, shared),
    events: {
      on(event, listener, eventOptions) {
        assertActive(activation);
        if (eventOptions?.signal?.aborted) {
          throw abortError('Event subscription aborted');
        }
        const listeners = activation.eventListeners.get(event) ?? new Set();
        listeners.add(listener);
        activation.eventListeners.set(event, listeners);
        const dispose = trackedDisposer(activation, () => {
          listeners.delete(listener);
        });
        eventOptions?.signal?.addEventListener('abort', dispose, {
          once: true,
        });
        return dispose;
      },
    },
    files: filesStore(activation),
    generation,
    importers: {
      register: (definition) => {
        if (typeof definition?.parse !== 'function') {
          throw new Error('Importer requires parse()');
        }
        return register(
          activation,
          activation.importers,
          definition,
          'Importer'
        );
      },
    },
    onCleanup: (cleanup) => trackedDisposer(activation, cleanup),
    panels: {
      close: (id) => activation.openPanels.delete(id),
      open: (id) => {
        assertActive(activation);
        if (!activation.panels.has(id)) {
          throw new Error(`Unknown panel id: ${id}`);
        }
        activation.openPanels.add(id);
      },
      register: (definition) =>
        register(activation, activation.panels, definition, 'Panel'),
    },
    pluginId: options.pluginId,
    selection,
    signal: activation.controller.signal,
    storage: {
      app: storageStore(activation, shared.appStorage),
      workspace: storageStore(activation, shared.workspaceStorage),
    },
    tasks: {
      schedule(id, schedule, run) {
        assertActive(activation);
        if (!id || typeof run !== 'function') {
          throw new Error('Task requires a nonempty id and run()');
        }
        if (activation.tasks.has(id)) {
          throw new Error(`Duplicate task id: ${id}`);
        }
        const task = Object.freeze({ id, run, schedule });
        activation.tasks.set(id, task);
        return trackedDisposer(activation, () => {
          if (activation.tasks.get(id) === task) {
            activation.tasks.delete(id);
          }
        });
      },
    },
    workers: {
      track: (worker) => trackedDisposer(activation, () => worker.terminate()),
    },
    workspaceId: options.workspaceId,
  };
  activation.app = Object.freeze(app);
  return activation;
}

async function retire(activation) {
  if (!activation.active) {
    return;
  }
  activation.active = false;
  activation.controller.abort();
  for (const cleanup of [...activation.cleanups].reverse()) {
    await cleanup();
  }
  activation.canvasTypes.clear();
  activation.commands.clear();
  activation.eventListeners.clear();
  activation.importers.clear();
  activation.openPanels.clear();
  activation.panels.clear();
  activation.tasks.clear();
}

export function createFakeHost(options) {
  if (
    !options ||
    typeof options.pluginId !== 'string' ||
    !options.pluginId.trim() ||
    typeof options.workspaceId !== 'string' ||
    !options.workspaceId.trim()
  ) {
    throw new Error('createFakeHost requires pluginId and workspaceId');
  }
  const emptyPlacements = Object.freeze({
    items: Object.freeze([]),
    viewId: null,
  });
  const shared = {
    appStorage: new Map(),
    noteSequence: 0,
    notes: new Map(),
    receipts: new Map(),
    selection: Object.freeze({
      error: null,
      items: Object.freeze([]),
      placements: emptyPlacements,
      status: 'ready',
    }),
    workspaceStorage: new Map(),
  };
  let generation = 1;
  let current = makeActivation(options, shared, generation);
  const inspection = {};
  Object.defineProperties(inspection, {
    canvasTypes: { get: () => [...current.canvasTypes.values()] },
    cleanupCount: { get: () => current.cleanups.size },
    commands: { get: () => [...current.commands.values()] },
    generation: { get: () => current.generation },
    importers: { get: () => [...current.importers.values()] },
    openPanels: { get: () => [...current.openPanels] },
    panels: { get: () => [...current.panels.values()] },
    signal: { get: () => current.controller.signal },
    tasks: { get: () => [...current.tasks.values()] },
  });
  const harness = {
    behavior: {
      abort: () => retire(current),
      async emit(event, payload) {
        assertActive(current);
        for (const listener of current.eventListeners.get(event) ?? []) {
          await listener(clone(payload));
        }
      },
      async parseImporter(id, file) {
        assertActive(current);
        const importer = current.importers.get(id);
        if (!importer) {
          throw new Error(`Unknown importer id: ${id}`);
        }
        return importer.parse(file, { signal: current.controller.signal });
      },
      async runCommand(id) {
        assertActive(current);
        const command = current.commands.get(id);
        if (!command) {
          throw new Error(`Unknown command id: ${id}`);
        }
        if (command.enabled?.() === false) {
          return;
        }
        await command.run();
      },
      async runTask(id) {
        assertActive(current);
        const task = current.tasks.get(id);
        if (!task) {
          throw new Error(`Unknown task id: ${id}`);
        }
        await task.run();
      },
      setSelection(snapshot) {
        assertActive(current);
        shared.selection = Object.freeze(clone(snapshot));
        for (const listener of current.selectionListeners) {
          listener();
        }
      },
    },
    files: {
      addBytes(name, bytes, fileOptions = {}) {
        assertActive(current);
        const stable = Uint8Array.from(bytes);
        const handle = Object.freeze({
          id: crypto.randomUUID(),
          kind: 'file',
          lastModified: fileOptions.lastModified ?? Date.now(),
          mimeType: fileOptions.mimeType ?? 'application/octet-stream',
          name,
          size: stable.byteLength,
        });
        current.files.set(handle.id, { bytes: stable, handle });
        return handle;
      },
      addDirectory(name) {
        assertActive(current);
        const handle = Object.freeze({
          id: crypto.randomUUID(),
          kind: 'directory',
          name,
        });
        current.directories.set(handle.id, {
          children: new Map(),
          handle,
        });
        return handle;
      },
      addText(name, text, fileOptions = {}) {
        return this.addBytes(name, new TextEncoder().encode(text), {
          ...fileOptions,
          mimeType: fileOptions.mimeType ?? 'text/plain',
        });
      },
      queuePick(...handles) {
        assertActive(current);
        current.queuedFiles = handles.map((handle) => {
          const file = current.files.get(handle.id);
          if (!file) {
            throw new Error('Cannot queue a file from another activation');
          }
          return file;
        });
      },
      queueDirectory(handle) {
        assertActive(current);
        const directory = current.directories.get(handle.id);
        if (!directory || directory.handle !== handle) {
          throw new Error('Cannot queue a directory from another activation');
        }
        current.queuedDirectories = [directory];
      },
    },
    inspection,
    lifecycle: {
      dispose: () => retire(current),
      async reload(factory) {
        const candidate = makeActivation(options, shared, ++generation);
        try {
          const cleanup = await factory(candidate.app);
          if (typeof cleanup === 'function') {
            trackedDisposer(candidate, cleanup);
          }
        } catch (error) {
          await retire(candidate);
          throw error;
        }
        const previous = current;
        current = candidate;
        await retire(previous);
        return candidate.app;
      },
    },
  };
  return Object.freeze({ app: current.app, harness: Object.freeze(harness) });
}
