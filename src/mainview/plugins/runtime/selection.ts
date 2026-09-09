import type {
  NoteContentSnapshot,
  OperationOptions,
  PlacementSelectionSnapshot,
  PluginContent,
  PluginSelection,
  SelectionSnapshot,
} from '../../../../packages/plugin-sdk';

const EMPTY_ITEMS = Object.freeze([]);
export const EMPTY_PLACEMENTS: PlacementSelectionSnapshot = Object.freeze({
  viewId: null,
  items: EMPTY_ITEMS,
});

export class SelectionSource {
  private snapshot = EMPTY_PLACEMENTS;
  private key = JSON.stringify(EMPTY_PLACEMENTS);
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): PlacementSelectionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(snapshot: PlacementSelectionSnapshot) {
    const key = JSON.stringify(snapshot);
    if (key === this.key) {
      return;
    }
    this.key = key;
    this.snapshot = Object.freeze({
      viewId: snapshot.viewId,
      items: Object.freeze(
        snapshot.items.map((item) =>
          Object.freeze({
            id: item.id,
            content: item.content ? Object.freeze({ ...item.content }) : null,
          })
        )
      ),
    });
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

function noteIds(placements: PlacementSelectionSnapshot): string[] {
  return [
    ...new Set(
      placements.items.flatMap((item) =>
        item.content?.kind === 'note' ? [item.content.id] : []
      )
    ),
  ].sort();
}

function freezeNotes(
  items: (NoteContentSnapshot | null)[]
): readonly NoteContentSnapshot[] {
  return Object.freeze(
    items.flatMap((item) => (item ? [Object.freeze({ ...item })] : []))
  );
}

export class PluginSelectionStore implements PluginSelection {
  private readonly listeners = new Set<() => void>();
  private readonly source: SelectionSource;
  private readonly content: Pick<PluginContent, 'getMany'>;
  private readonly signal: AbortSignal;
  private readonly report: (error: unknown) => void;
  private snapshot: SelectionSnapshot;
  private published = false;
  private disposed = false;
  private version = 0;
  private request?: AbortController;
  private unsubscribe?: () => void;

  constructor(options: {
    source: SelectionSource;
    content: Pick<PluginContent, 'getMany'>;
    signal: AbortSignal;
    report: (error: unknown) => void;
  }) {
    this.source = options.source;
    this.content = options.content;
    this.signal = options.signal;
    this.report = options.report;
    this.snapshot = Object.freeze({
      status: 'loading',
      items: EMPTY_ITEMS,
      placements: EMPTY_PLACEMENTS,
      error: null,
    });
    this.signal.addEventListener('abort', this.dispose, { once: true });
    if (this.signal.aborted) {
      this.dispose();
    }
  }

  private assertActive(options?: OperationOptions) {
    if (this.disposed || this.signal.aborted || options?.signal?.aborted) {
      throw new DOMException(
        'Selection activation or request is inactive',
        'AbortError'
      );
    }
  }

  getPlacements = (): PlacementSelectionSnapshot => {
    this.assertActive();
    return this.source.getSnapshot();
  };

  get = async (
    options?: OperationOptions
  ): Promise<readonly NoteContentSnapshot[]> => {
    this.assertActive(options);
    const ids = noteIds(this.source.getSnapshot());
    const items = ids.length ? await this.content.getMany(ids, options) : [];
    this.assertActive(options);
    return freezeNotes(items);
  };

  getSnapshot = (): SelectionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.assertActive();
    const wrapped = () => listener();
    this.listeners.add(wrapped);
    return () => {
      this.listeners.delete(wrapped);
    };
  };

  private notify() {
    for (const listener of [...this.listeners]) {
      if (this.disposed) {
        break;
      }
      if (!this.listeners.has(listener)) {
        continue;
      }
      try {
        listener();
      } catch (error) {
        this.report(error);
      }
    }
  }

  publish() {
    if (this.published || this.disposed) {
      return;
    }
    this.published = true;
    this.unsubscribe = this.source.subscribe(this.refresh);
    this.refresh();
  }

  invalidate(ids: readonly string[]) {
    if (noteIds(this.source.getSnapshot()).some((id) => ids.includes(id))) {
      this.refresh();
    }
  }

  private readonly refresh = () => {
    if (!this.published || this.disposed) {
      return;
    }
    const version = ++this.version;
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    const placements = this.source.getSnapshot();
    const ids = noteIds(placements);
    this.snapshot = Object.freeze({
      status: ids.length ? 'loading' : 'ready',
      items: EMPTY_ITEMS,
      placements,
      error: null,
    });
    this.notify();
    if (!ids.length || this.disposed || version !== this.version) {
      return;
    }
    const current = () => !this.disposed && version === this.version;
    Promise.resolve()
      .then(() => {
        if (!current()) {
          return [];
        }
        return this.content.getMany(ids, { signal: request.signal });
      })
      .then((items) => {
        if (!current()) {
          return;
        }
        this.snapshot = Object.freeze({
          status: 'ready',
          items: freezeNotes(items),
          placements,
          error: null,
        });
        this.notify();
      })
      .catch((error: unknown) => {
        if (!current()) {
          return;
        }
        const failure =
          error && typeof error === 'object'
            ? (error as { code?: unknown; message?: unknown })
            : {};
        this.snapshot = Object.freeze({
          status: 'error',
          items: EMPTY_ITEMS,
          placements,
          error: Object.freeze({
            code:
              typeof failure.code === 'string'
                ? failure.code
                : 'selection-error',
            message:
              typeof failure.message === 'string'
                ? failure.message
                : 'Selection read failed',
          }),
        });
        this.notify();
      });
  };

  dispose = () => {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.version += 1;
    this.request?.abort();
    this.unsubscribe?.();
    this.signal.removeEventListener('abort', this.dispose);
    this.snapshot = Object.freeze({
      status: 'error',
      items: EMPTY_ITEMS,
      placements: EMPTY_PLACEMENTS,
      error: Object.freeze({
        code: 'activation-inactive',
        message: 'Selection activation is inactive',
      }),
    });
    this.listeners.clear();
  };
}
