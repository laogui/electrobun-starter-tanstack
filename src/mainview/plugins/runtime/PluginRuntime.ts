import type {
  CanvasTypeDefinition,
  CommandDefinition,
  Disposer,
  ImporterDefinition,
  ImporterFieldMapping,
  ImporterNoteField,
  PanelDefinition,
  PlacementSelectionSnapshot,
  PluginContent,
  PluginContext,
  PluginDefinition,
  PluginEventMap,
  PluginFiles,
} from '../../../../packages/plugin-sdk';
import type {
  PluginRuntimeDescriptor,
  PluginRuntimeSnapshot,
} from '../../../shared/plugins/runtime';
import { canvasTypeRegistry } from '../../extensions/registry';
import type { AnyBuiltinCanvasType } from '../../extensions/types';
import { ActivationServices } from './activationServices';
import { createPluginContent } from './content';
import {
  createPluginFiles,
  normalizePluginFileFilters,
  type PluginFilesTransport,
} from './files';
import {
  type ImporterSessionSnapshot,
  notesForCommit,
  raceImporterAbort,
  validateImporterFieldInspection,
  validateImporterFieldMapping,
  validateImporterParseResult,
} from './importers';
import {
  canvasImporterPlacementHost,
  type ImporterPlacementHost,
  MAX_CANVAS_IMPORT_NOTES,
} from './importPlacement';
import { type MountPanel, mountFloatingPanel, renderPanel } from './panels';
import { adaptPluginCanvasType } from './pluginCanvasTypes';
import {
  EMPTY_PLACEMENTS,
  PluginSelectionStore,
  SelectionSource,
} from './selection';
import {
  isEditingShortcut,
  matchesShortcut,
  parseShortcut,
  type Shortcut,
} from './shortcuts';
import {
  createPluginStorage,
  type PluginStorageTransportOptions,
} from './storage';

export interface RuntimeDiagnostic {
  message: string;
  phase: string;
  pluginId: string;
}

export interface RuntimeViewSnapshot {
  canvasTypes: { id: string; pluginId: string; title: string }[];
  commands: {
    pluginId: string;
    id: string;
    title: string;
    shortcut?: string;
  }[];
  diagnostics: RuntimeDiagnostic[];
  importers: {
    accept: readonly {
      description: string;
      extensions: readonly string[];
    }[];
    id: string;
    pluginId: string;
    title: string;
  }[];
  importSession: ImporterSessionSnapshot | null;
  panels: { pluginId: string; id: string; title: string; open: boolean }[];
  plugins: {
    pluginId: string;
    name: string;
    version: string;
    development: boolean;
    status: 'loading' | 'running' | 'failed';
  }[];
  workspaceId: string;
}

export interface PluginRuntimeOptions {
  cleanupTimeoutMs?: number;
  contentTransport?: PluginStorageTransportOptions;
  filesTransport?: PluginFilesTransport;
  importer?: (url: string) => Promise<unknown>;
  mountPanel?: MountPanel;
  onDiagnostic?: (diagnostic: RuntimeDiagnostic) => void;
  placementHost?: ImporterPlacementHost;
  storageTransport?: PluginStorageTransportOptions;
}

interface CommandRegistration {
  definition: CommandDefinition;
  shortcut?: Shortcut;
}

interface PanelRegistration {
  close?: Disposer;
  definition: PanelDefinition;
}

interface ImporterRegistration {
  definition: ImporterDefinition;
}

interface ImporterSession {
  activation: Activation;
  committedItems: Array<{
    color: string;
    id: string;
    revision: number;
    title: string;
  }>;
  configurable: boolean;
  controller: AbortController;
  registration: ImporterRegistration;
  segmented: boolean;
  snapshot: ImporterSessionSnapshot;
}

interface Activation {
  activationId: string;
  active: boolean;
  cancel: () => void;
  cancelled: Promise<void>;
  canvasTypes: Map<string, AnyBuiltinCanvasType>;
  cleanups: Set<Disposer>;
  commands: Map<string, CommandRegistration>;
  content?: PluginContent;
  controller: AbortController;
  descriptor: PluginRuntimeDescriptor;
  files?: PluginFiles;
  generation: number;
  importers: Map<string, ImporterRegistration>;
  openPanels: Set<string>;
  panels: Map<string, PanelRegistration>;
  pendingCleanups: Set<Promise<void>>;
  ready: Promise<void>;
  retirement?: Promise<void>;
  selection?: PluginSelectionStore;
  services?: ActivationServices;
  status: 'loading' | 'running' | 'failed';
  workspaceId: string;
}

export function redactPluginError(error: unknown): string {
  let text: string;
  try {
    text =
      error instanceof Error
        ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`
        : String(error);
  } catch {
    text = 'Plugin threw an error that could not be formatted';
  }
  return text
    .replace(/(\/plugins\/)[^/\s]+\//g, '$1[redacted]/')
    .replace(/([?&](?:token|bearer|launch-token)=)[^&#\s]+/gi, '$1[redacted]');
}

function validateRegistration(value: { id: string; title: string }) {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.title !== 'string' ||
    !value.title.trim()
  ) {
    throw new Error('Registration requires a nonempty id and title');
  }
}

export class PluginRuntime {
  private readonly options: PluginRuntimeOptions;
  private readonly selectionSource = new SelectionSource();
  private readonly activations = new Map<string, Activation>();
  private readonly candidates = new Map<string, Activation>();
  private readonly generations = new Map<string, number>();
  private readonly released = new Map<string, PluginRuntimeDescriptor>();
  private readonly retirements = new Map<string, Promise<void>>();
  private readonly listeners = new Set<() => void>();
  private readonly shortcutDisposers = new Set<() => void>();
  private readonly diagnostics: RuntimeDiagnostic[] = [];
  private hostDiagnostics: RuntimeDiagnostic[] = [];
  private importSession?: ImporterSession;
  private workspaceId = '';
  private revision = 0;
  private snapshot: RuntimeViewSnapshot = {
    workspaceId: '',
    plugins: [],
    canvasTypes: [],
    commands: [],
    importers: [],
    importSession: null,
    panels: [],
    diagnostics: [],
  };

  constructor(options: PluginRuntimeOptions = {}) {
    this.options = options;
  }

  getSnapshot = (): RuntimeViewSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  report(pluginId: string, phase: string, error: unknown) {
    const diagnostic = { pluginId, phase, message: redactPluginError(error) };
    const last = this.diagnostics.at(-1);
    if (
      last?.pluginId === pluginId &&
      last.phase === phase &&
      last.message === diagnostic.message
    ) {
      return;
    }
    this.diagnostics.push(diagnostic);
    if (this.diagnostics.length > 100) {
      this.diagnostics.shift();
    }
    this.publish();
    try {
      this.options.onDiagnostic?.(diagnostic);
    } catch {
      // A diagnostic consumer must not interrupt resource cleanup.
    }
  }

  private publish() {
    const instances = [...this.activations.values()].filter(
      (item) => item.active
    );
    const visible = new Map(this.candidates);
    for (const instance of instances) {
      visible.set(instance.descriptor.pluginId, instance);
    }
    this.snapshot = {
      workspaceId: this.workspaceId,
      plugins: [...visible.values()].map(({ descriptor, status }) => ({
        pluginId: descriptor.pluginId,
        name: descriptor.name,
        version: descriptor.version,
        development: descriptor.development,
        status,
      })),
      canvasTypes: instances.flatMap((instance) =>
        [...instance.canvasTypes.values()].map((definition) => ({
          pluginId: instance.descriptor.pluginId,
          id: definition.id,
          title: definition.titleKey,
        }))
      ),
      commands: instances.flatMap((instance) =>
        [...instance.commands.values()].map(({ definition }) => ({
          pluginId: instance.descriptor.pluginId,
          id: definition.id,
          title: definition.title,
          shortcut: definition.shortcut,
        }))
      ),
      importers: instances.flatMap((instance) =>
        [...instance.importers.values()].map(({ definition }) => ({
          accept: definition.accept,
          id: definition.id,
          pluginId: instance.descriptor.pluginId,
          title: definition.title,
        }))
      ),
      importSession: this.importSession?.snapshot ?? null,
      panels: instances.flatMap((instance) =>
        [...instance.panels.values()].map(({ definition, close }) => ({
          pluginId: instance.descriptor.pluginId,
          id: definition.id,
          title: definition.title,
          open: Boolean(close),
        }))
      ),
      diagnostics: [...this.hostDiagnostics, ...this.diagnostics],
    };
    for (const listener of this.listeners) {
      listener();
    }
  }

  async sync(snapshot: PluginRuntimeSnapshot): Promise<void> {
    const revision = ++this.revision;
    const workspaceChanged = this.workspaceId !== snapshot.workspaceId;
    this.workspaceId = snapshot.workspaceId;
    this.hostDiagnostics = snapshot.diagnostics.map((diagnostic) => ({
      pluginId: diagnostic.pluginId,
      phase: 'host',
      message: redactPluginError(diagnostic.message),
    }));
    const desired = new Map(
      snapshot.plugins.map((plugin) => [plugin.pluginId, plugin])
    );
    for (const collection of [this.activations, this.candidates]) {
      for (const [id, instance] of [...collection]) {
        if (revision !== this.revision) {
          return;
        }
        if (instance.workspaceId !== snapshot.workspaceId || !desired.has(id)) {
          collection.delete(id);
          this.retire(instance);
        }
      }
    }
    if (revision !== this.revision) {
      return;
    }
    if (workspaceChanged) {
      this.selectionSource.set(EMPTY_PLACEMENTS);
    }
    for (const descriptor of desired.values()) {
      if (revision !== this.revision) {
        return;
      }
      const candidate = this.candidates.get(descriptor.pluginId);
      if (
        candidate?.descriptor.entryUrl === descriptor.entryUrl &&
        candidate.descriptor.generation === descriptor.generation &&
        candidate.descriptor.version === descriptor.version
      ) {
        continue;
      }
      this.createActivation(descriptor);
    }
    this.publish();
    await Promise.all([...this.candidates.values()].map((item) => item.ready));
    await Promise.all(this.retirements.values());
  }

  updateSelection(
    workspaceId: string,
    snapshot: PlacementSelectionSnapshot
  ): void {
    if (workspaceId === this.workspaceId) {
      this.selectionSource.set(snapshot);
    }
  }

  emitHostEvent<K extends keyof PluginEventMap>(
    event: K,
    payload: PluginEventMap[K]
  ): void {
    if (payload.workspaceId !== this.workspaceId) {
      return;
    }
    for (const instance of this.activations.values()) {
      if (instance.workspaceId === payload.workspaceId) {
        if (event === 'content.changed') {
          const change = payload as PluginEventMap['content.changed'];
          if (change.kind === 'note') {
            instance.selection?.invalidate(change.ids);
          }
        }
        instance.services?.emit(event, payload);
      }
    }
  }

  getReleasedGenerations(): readonly PluginRuntimeDescriptor[] {
    return [...this.released.values()];
  }

  acknowledgeRelease(descriptor: PluginRuntimeDescriptor): void {
    this.released.delete(descriptor.entryUrl);
  }

  private createActivation(descriptor: PluginRuntimeDescriptor) {
    const revision = this.revision;
    const id = descriptor.pluginId;
    const priorCandidate = this.candidates.get(id);
    if (priorCandidate && priorCandidate !== this.activations.get(id)) {
      this.retire(priorCandidate);
    }
    // Abort handlers can synchronously replace the desired workspace/plugin set.
    if (revision !== this.revision) {
      return;
    }
    const previous = this.retirements.get(id);
    let cancel: () => void = () => undefined;
    const cancelled = new Promise<void>((resolve) => {
      cancel = resolve;
    });
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    const instance: Activation = {
      descriptor: { ...descriptor },
      workspaceId: this.workspaceId,
      active: true,
      activationId: crypto.randomUUID(),
      status: 'loading',
      generation,
      controller: new AbortController(),
      canvasTypes: new Map(),
      commands: new Map(),
      importers: new Map(),
      panels: new Map(),
      openPanels: new Set(),
      cleanups: new Set(),
      pendingCleanups: new Set(),
      cancel,
      cancelled,
      ready: Promise.resolve(),
    };
    this.candidates.set(id, instance);
    this.released.delete(descriptor.entryUrl);
    instance.ready = Promise.race([
      this.activate(instance, previous),
      cancelled,
    ]);
  }

  private async activate(instance: Activation, previous?: Promise<void>) {
    let phase = 'import';
    try {
      await previous;
      if (!instance.active) {
        return;
      }
      const importer =
        this.options.importer ??
        ((url: string) => import(/* @vite-ignore */ url));
      const module = await importer(instance.descriptor.entryUrl);
      if (!instance.active) {
        return;
      }
      if (
        !module ||
        typeof module !== 'object' ||
        !('default' in module) ||
        !module.default ||
        typeof (module.default as PluginDefinition).setup !== 'function'
      ) {
        throw new Error(
          'Plugin must default-export a definition with setup(app)'
        );
      }
      phase = 'setup';
      const cleanup = await (module.default as PluginDefinition).setup(
        this.context(instance)
      );
      if (cleanup !== undefined && typeof cleanup !== 'function') {
        throw new Error('setup must return a disposer or undefined');
      }
      if (cleanup) {
        this.track(instance, cleanup);
      }
      if (!instance.active) {
        return;
      }
      const id = instance.descriptor.pluginId;
      const old = this.activations.get(id);
      canvasTypeRegistry.replaceOwner(id, instance.generation, [
        ...instance.canvasTypes.values(),
      ]);
      if (old) {
        this.activations.delete(id);
        await this.retire(old);
      }
      if (!instance.active || this.candidates.get(id) !== instance) {
        return;
      }
      this.activations.set(id, instance);
      instance.status = 'running';
      this.publish();
      instance.selection?.publish();
      instance.services?.publish();
      for (const panelId of instance.openPanels) {
        this.openPanel(id, panelId);
      }
      instance.openPanels.clear();
    } catch (error) {
      this.report(instance.descriptor.pluginId, phase, error);
      if (instance.active) {
        instance.status = 'failed';
        await this.retire(instance);
        this.publish();
      }
    }
  }

  private assertActive(instance: Activation) {
    const id = instance.descriptor.pluginId;
    if (
      !instance.active ||
      (this.activations.get(id) !== instance &&
        this.candidates.get(id) !== instance)
    ) {
      throw new Error('Plugin activation is no longer active');
    }
  }

  private track(instance: Activation, cleanup: Disposer): Disposer {
    if (typeof cleanup !== 'function') {
      throw new Error('Cleanup must be a function');
    }
    let result: Promise<void> | undefined;
    let called = false;
    const dispose = () => {
      if (called) {
        return result;
      }
      called = true;
      instance.cleanups.delete(dispose);
      const pending = this.clean(instance.descriptor.pluginId, cleanup);
      instance.pendingCleanups.add(pending);
      result = pending.finally(() => {
        instance.pendingCleanups.delete(pending);
      });
      return result;
    };
    if (instance.active) {
      instance.cleanups.add(dispose);
    } else {
      dispose();
    }
    return dispose;
  }

  private async clean(pluginId: string, cleanup: Disposer): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const pending = cleanup();
      if (pending) {
        await Promise.race([
          pending,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    'Cleanup timed out; reload the window if resources remain'
                  )
                ),
              this.options.cleanupTimeoutMs ?? 2000
            );
          }),
        ]);
      }
    } catch (error) {
      this.report(pluginId, 'cleanup', error);
    } finally {
      clearTimeout(timer);
    }
  }

  private retire(instance: Activation): Promise<void> {
    if (instance.retirement) {
      return instance.retirement;
    }
    const id = instance.descriptor.pluginId;
    const previous = this.retirements.get(id);
    let finish!: () => void;
    const retiring = new Promise<void>((resolve) => {
      finish = resolve;
    });
    instance.retirement = retiring;
    this.retirements.set(id, retiring);
    Promise.all([previous, this.deactivate(instance)]).then(() => {
      const stillUsed = [
        this.activations.get(id),
        this.candidates.get(id),
      ].some(
        (current) =>
          current?.active &&
          current.descriptor.entryUrl === instance.descriptor.entryUrl
      );
      if (!stillUsed) {
        this.released.set(instance.descriptor.entryUrl, instance.descriptor);
      }
      if (this.retirements.get(id) === retiring) {
        this.retirements.delete(id);
      }
      finish();
    });
    return retiring;
  }

  private async deactivate(instance: Activation): Promise<void> {
    instance.active = false;
    instance.cancel();
    this.cancelImporterSessionFor(instance);
    instance.controller.abort();
    instance.commands.clear();
    instance.importers.clear();
    instance.openPanels.clear();
    canvasTypeRegistry.clearOwner(
      instance.descriptor.pluginId,
      instance.generation
    );
    this.publish();
    for (const cleanup of [...instance.cleanups].reverse()) {
      await cleanup();
    }
    instance.panels.clear();
    await Promise.all(instance.pendingCleanups);
  }

  private context(instance: Activation): PluginContext {
    const pluginId = instance.descriptor.pluginId;
    const services = new ActivationServices({
      assertActive: () => this.assertActive(instance),
      isPublished: () => this.activations.get(pluginId) === instance,
      report: (phase, error) => this.report(pluginId, phase, error),
      signal: instance.controller.signal,
      track: (cleanup) => this.track(instance, cleanup),
      workspaceId: instance.workspaceId,
    });
    instance.services = services;
    const storageContext = {
      pluginId,
      workspaceId: instance.workspaceId,
      signal: instance.controller.signal,
    };
    const content = createPluginContent(
      storageContext,
      this.options.contentTransport
    );
    instance.content = content;
    const files = createPluginFiles(
      {
        activationId: instance.activationId,
        pluginId,
        workspaceId: instance.workspaceId,
        signal: instance.controller.signal,
      },
      this.options.filesTransport
    );
    instance.files = files;
    const selection = new PluginSelectionStore({
      source: this.selectionSource,
      content,
      signal: instance.controller.signal,
      report: (error) => this.report(pluginId, 'selection', error),
    });
    instance.selection = selection;
    return Object.freeze({
      canvas: {
        registerType: <TState>(definition: CanvasTypeDefinition<TState>) => {
          this.assertActive(instance);
          const adapted = adaptPluginCanvasType(pluginId, definition);
          if (instance.canvasTypes.has(adapted.id)) {
            throw new Error(`Duplicate canvas type id: ${adapted.id}`);
          }
          instance.canvasTypes.set(adapted.id, adapted);
          this.publish();
          return this.track(instance, () => {
            if (instance.canvasTypes.get(adapted.id) !== adapted) {
              return;
            }
            instance.canvasTypes.delete(adapted.id);
            if (this.activations.get(pluginId) === instance) {
              canvasTypeRegistry.replaceOwner(pluginId, instance.generation, [
                ...instance.canvasTypes.values(),
              ]);
            }
            this.publish();
          });
        },
      },
      content,
      files,
      selection,
      storage: {
        app: createPluginStorage(
          storageContext,
          'app',
          this.options.storageTransport
        ),
        workspace: createPluginStorage(
          storageContext,
          'workspace',
          this.options.storageTransport
        ),
      },
      events: services.events,
      tasks: services.scheduledTasks,
      pluginId,
      generation: instance.generation,
      importers: {
        register: (definition: ImporterDefinition) => {
          this.assertActive(instance);
          validateRegistration(definition);
          if (
            typeof definition.parse !== 'function' ||
            (definition.inspectFields !== undefined &&
              typeof definition.inspectFields !== 'function')
          ) {
            throw new Error('Importer requires a parse() function');
          }
          if (instance.importers.has(definition.id)) {
            throw new Error(`Duplicate importer id: ${definition.id}`);
          }
          const registration: ImporterRegistration = {
            definition: {
              ...definition,
              accept: normalizePluginFileFilters(definition.accept),
            },
          };
          instance.importers.set(definition.id, registration);
          this.publish();
          return this.track(instance, () => {
            if (
              instance.importers.get(registration.definition.id) ===
              registration
            ) {
              this.cancelImporterSessionFor(instance, registration);
              instance.importers.delete(registration.definition.id);
              this.publish();
            }
          });
        },
      },
      signal: instance.controller.signal,
      workspaceId: instance.workspaceId,
      commands: {
        register: (definition: CommandDefinition) => {
          this.assertActive(instance);
          validateRegistration(definition);
          if (
            typeof definition.run !== 'function' ||
            (definition.enabled !== undefined &&
              typeof definition.enabled !== 'function')
          ) {
            throw new Error(
              'Command requires run() and optional enabled() functions'
            );
          }
          if (instance.commands.has(definition.id)) {
            throw new Error(`Duplicate command id: ${definition.id}`);
          }
          const registration: CommandRegistration = {
            definition: { ...definition },
          };
          if (definition.shortcut) {
            try {
              registration.shortcut = parseShortcut(definition.shortcut);
            } catch (error) {
              this.report(pluginId, 'shortcut', error);
            }
          }
          instance.commands.set(definition.id, registration);
          this.publish();
          return this.track(instance, () => {
            if (
              instance.commands.get(registration.definition.id) === registration
            ) {
              instance.commands.delete(registration.definition.id);
              this.publish();
            }
          });
        },
      },
      panels: {
        register: (definition: PanelDefinition) => {
          this.assertActive(instance);
          validateRegistration(definition);
          if (
            ('mount' in definition && definition.mount !== undefined) ===
              ('component' in definition &&
                definition.component !== undefined) ||
            (definition.mount !== undefined &&
              typeof definition.mount !== 'function')
          ) {
            throw new Error('Panel requires exactly one of component or mount');
          }
          if (instance.panels.has(definition.id)) {
            throw new Error(`Duplicate panel id: ${definition.id}`);
          }
          const registration: PanelRegistration = {
            definition: { ...definition },
          };
          instance.panels.set(definition.id, registration);
          this.publish();
          return this.track(instance, () => {
            if (
              instance.panels.get(registration.definition.id) === registration
            ) {
              instance.panels.delete(registration.definition.id);
              instance.openPanels.delete(registration.definition.id);
              const closing = registration.close?.();
              this.publish();
              return closing;
            }
          });
        },
        open: (id: string) => {
          this.assertActive(instance);
          if (this.activations.get(pluginId) === instance) {
            this.openPanel(pluginId, id);
          } else {
            instance.openPanels.add(id);
          }
        },
        close: (id: string) => {
          this.assertActive(instance);
          if (this.activations.get(pluginId) === instance) {
            this.closePanel(pluginId, id);
          } else {
            instance.openPanels.delete(id);
          }
        },
      },
      onCleanup: (cleanup: Disposer) => this.track(instance, cleanup),
      workers: {
        track: (worker: Worker) =>
          this.track(instance, () => worker.terminate()),
      },
    });
  }

  private isCurrentImporterSession(session: ImporterSession): boolean {
    const pluginId = session.activation.descriptor.pluginId;
    return (
      this.importSession === session &&
      session.activation.active &&
      this.activations.get(pluginId) === session.activation &&
      session.activation.importers.get(session.registration.definition.id) ===
        session.registration
    );
  }

  private cancelImporterSessionFor(
    activation?: Activation,
    registration?: ImporterRegistration
  ): void {
    const session = this.importSession;
    if (
      !session ||
      (activation && session.activation !== activation) ||
      (registration && session.registration !== registration)
    ) {
      return;
    }
    this.importSession = undefined;
    if (session.snapshot.file) {
      session.activation.files?.release(session.snapshot.file);
    }
    session.controller.abort();
    this.publish();
  }

  cancelImporterSession(operationId: string): void {
    if (
      this.importSession?.snapshot.operationId === operationId &&
      this.importSession.snapshot.canCancel
    ) {
      this.cancelImporterSessionFor();
    }
  }

  updateImporterMapping(
    operationId: string,
    target: ImporterNoteField,
    source: string | null
  ): void {
    const session = this.importSession;
    if (
      !session ||
      session.snapshot.operationId !== operationId ||
      !session.configurable ||
      !['configuring', 'failed'].includes(session.snapshot.status) ||
      !['title', 'text', 'color'].includes(target) ||
      !(source === null || session.snapshot.sourceFields.includes(source)) ||
      !session.snapshot.mapping
    ) {
      throw new Error('Importer field mapping is not available');
    }
    const mapping = { ...session.snapshot.mapping, [target]: source };
    if (source !== null) {
      for (const other of ['title', 'text', 'color'] as const) {
        if (other !== target && mapping[other] === source) {
          mapping[other] = null;
        }
      }
    }
    session.snapshot = Object.freeze({
      ...session.snapshot,
      canPrepare: mapping.title !== null,
      error: null,
      mapping: Object.freeze(mapping),
      status: 'configuring',
    });
    this.publish();
  }

  updateImporterPlacement(
    operationId: string,
    placement: {
      mode: 'canvas' | 'detached';
      strategy?: 'grid' | 'vertical';
      viewId?: string | null;
    }
  ): void {
    const session = this.importSession;
    if (
      !session ||
      session.snapshot.operationId !== operationId ||
      session.snapshot.status !== 'preview' ||
      session.snapshot.completedNotes !== 0
    ) {
      throw new Error('Importer placement is not configurable');
    }
    if (placement.mode === 'detached') {
      session.snapshot = Object.freeze({
        ...session.snapshot,
        placement: Object.freeze({
          mode: 'detached' as const,
          strategy: 'grid' as const,
          viewId: null,
        }),
      });
      this.publish();
      return;
    }
    if (session.snapshot.totalNotes > MAX_CANVAS_IMPORT_NOTES) {
      throw new Error(
        `Canvas placement is limited to ${MAX_CANVAS_IMPORT_NOTES} notes`
      );
    }
    const viewId = placement.viewId ?? '';
    if (
      !session.snapshot.placementTargets.some((target) => target.id === viewId)
    ) {
      throw new Error('Importer canvas target is not available');
    }
    const strategy = placement.strategy ?? 'grid';
    if (!['grid', 'vertical'].includes(strategy)) {
      throw new Error('Importer placement strategy is invalid');
    }
    session.snapshot = Object.freeze({
      ...session.snapshot,
      placement: Object.freeze({
        mode: 'canvas' as const,
        strategy,
        viewId,
      }),
    });
    this.publish();
  }

  async prepareImporterSession(operationId: string): Promise<void> {
    const session = this.importSession;
    if (
      !session ||
      session.snapshot.operationId !== operationId ||
      !session.snapshot.canPrepare ||
      !session.snapshot.file ||
      !session.snapshot.mapping ||
      !this.isCurrentImporterSession(session)
    ) {
      throw new Error('Importer field mapping is not ready');
    }
    const mapping = validateImporterFieldMapping(
      session.snapshot.mapping,
      session.snapshot.sourceFields
    );
    session.snapshot = Object.freeze({
      ...session.snapshot,
      canPrepare: false,
      error: null,
      mapping,
      notes: Object.freeze([]),
      segments: Object.freeze([]),
      status: 'parsing',
      totalNotes: 0,
      warnings: Object.freeze([]),
    });
    this.publish();
    await this.parseImporterSession(session, mapping);
  }

  async confirmImporterSession(operationId: string): Promise<void> {
    const session = this.importSession;
    if (
      !session ||
      session.snapshot.operationId !== operationId ||
      !session.snapshot.canConfirm ||
      !session.activation.content ||
      !this.isCurrentImporterSession(session)
    ) {
      throw new Error('Importer preview is not available');
    }
    while (this.isCurrentImporterSession(session)) {
      const index = session.snapshot.segments.findIndex((segment) =>
        ['failed', 'pending'].includes(segment.status)
      );
      if (index < 0) {
        if (session.snapshot.placement.mode === 'canvas') {
          const placementHost =
            this.options.placementHost ?? canvasImporterPlacementHost;
          const viewId = session.snapshot.placement.viewId;
          if (!viewId) {
            throw new Error('Importer canvas target is not available');
          }
          session.snapshot = Object.freeze({
            ...session.snapshot,
            canCancel: false,
            canConfirm: false,
            canRollback: false,
            error: null,
            status: 'placing',
          });
          this.publish();
          try {
            await placementHost.place({
              items: session.committedItems,
              operationId,
              strategy: session.snapshot.placement.strategy,
              viewId,
            });
          } catch (error) {
            if (!this.isCurrentImporterSession(session)) {
              return;
            }
            session.snapshot = Object.freeze({
              ...session.snapshot,
              canCancel: true,
              canConfirm: true,
              canRollback: true,
              error: redactPluginError(error),
              status: 'placement-failed',
            });
            this.report(session.snapshot.pluginId, 'importer-placement', error);
            this.publish();
            return;
          }
          if (!this.isCurrentImporterSession(session)) {
            return;
          }
        }
        if (!session.segmented) {
          this.cancelImporterSessionFor(
            session.activation,
            session.registration
          );
          return;
        }
        if (session.snapshot.file) {
          session.activation.files?.release(session.snapshot.file);
        }
        session.snapshot = Object.freeze({
          ...session.snapshot,
          canCancel: true,
          canConfirm: false,
          canRollback: true,
          error: null,
          status: 'completed',
        });
        this.publish();
        return;
      }
      const segment = session.snapshot.segments[index]!;
      const notes = notesForCommit(
        session.snapshot.notes.slice(segment.start - 1, segment.end)
      );
      session.snapshot = Object.freeze({
        ...session.snapshot,
        canCancel: false,
        canConfirm: false,
        canRollback: false,
        error: null,
        segments: Object.freeze(
          session.snapshot.segments.map((item, itemIndex) =>
            itemIndex === index
              ? Object.freeze({
                  ...item,
                  error: null,
                  status: 'committing' as const,
                })
              : item
          )
        ),
        status: 'committing',
      });
      this.publish();
      try {
        const result = await session.activation.content.createMany(notes, {
          label: session.segmented
            ? `Import notes ${segment.start}–${segment.end} with ${session.snapshot.importerTitle}`
            : `Import ${notes.length} notes with ${session.snapshot.importerTitle}`,
          operationId: segment.operationId,
          signal: session.controller.signal,
        });
        if (!this.isCurrentImporterSession(session)) {
          return;
        }
        if (result.operationId !== segment.operationId) {
          throw new Error('Importer segment operation identity mismatch');
        }
        session.committedItems.push(...result.items);
        session.snapshot = Object.freeze({
          ...session.snapshot,
          completedNotes: session.snapshot.completedNotes + notes.length,
          segments: Object.freeze(
            session.snapshot.segments.map((item, itemIndex) =>
              itemIndex === index
                ? Object.freeze({ ...item, status: 'completed' as const })
                : item
            )
          ),
        });
        this.publish();
      } catch (error) {
        if (!this.isCurrentImporterSession(session)) {
          return;
        }
        const message = redactPluginError(error);
        session.snapshot = Object.freeze({
          ...session.snapshot,
          canCancel: true,
          canConfirm: true,
          canRollback: session.snapshot.completedNotes > 0,
          error: message,
          segments: Object.freeze(
            session.snapshot.segments.map((item, itemIndex) =>
              itemIndex === index
                ? Object.freeze({
                    ...item,
                    error: message,
                    status: 'failed' as const,
                  })
                : item
            )
          ),
          status: 'failed',
        });
        this.report(session.snapshot.pluginId, 'importer-commit', error);
        return;
      }
    }
  }

  async rollbackImporterSession(operationId: string): Promise<void> {
    const session = this.importSession;
    if (
      !session ||
      session.snapshot.operationId !== operationId ||
      !session.snapshot.canRollback ||
      !session.activation.content ||
      !this.isCurrentImporterSession(session)
    ) {
      throw new Error('Importer rollback is not available');
    }
    session.snapshot = Object.freeze({
      ...session.snapshot,
      canCancel: false,
      canConfirm: false,
      canRollback: false,
      error: null,
      status: 'rolling-back',
    });
    this.publish();
    let conflicts = 0;
    for (
      let index = session.snapshot.segments.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (!this.isCurrentImporterSession(session)) {
        return;
      }
      const segment = session.snapshot.segments[index]!;
      if (
        !['completed', 'rollback-conflict', 'rollback-failed'].includes(
          segment.status
        )
      ) {
        continue;
      }
      session.snapshot = Object.freeze({
        ...session.snapshot,
        segments: Object.freeze(
          session.snapshot.segments.map((item, itemIndex) =>
            itemIndex === index
              ? Object.freeze({
                  ...item,
                  error: null,
                  status: 'rolling-back' as const,
                })
              : item
          )
        ),
      });
      this.publish();
      const rollbackOperationId = `${operationId}_rollback_${index + 1}`;
      try {
        const result = await session.activation.content.undo(
          segment.operationId,
          {
            operationId: rollbackOperationId,
            signal: session.controller.signal,
          }
        );
        if (!this.isCurrentImporterSession(session)) {
          return;
        }
        if (
          result.operationId !== rollbackOperationId ||
          result.removedIds?.length !== segment.end - segment.start + 1
        ) {
          throw new Error('Importer rollback receipt is incomplete');
        }
        session.snapshot = Object.freeze({
          ...session.snapshot,
          completedNotes:
            session.snapshot.completedNotes - (segment.end - segment.start + 1),
          segments: Object.freeze(
            session.snapshot.segments.map((item, itemIndex) =>
              itemIndex === index
                ? Object.freeze({
                    ...item,
                    error: null,
                    status: 'rolled-back' as const,
                  })
                : item
            )
          ),
        });
        this.publish();
      } catch (error) {
        if (!this.isCurrentImporterSession(session)) {
          return;
        }
        const code =
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : '';
        const message = redactPluginError(error);
        const conflict = [
          'content-referenced',
          'corrupt-content',
          'reference-check-failed',
          'revision-conflict',
          'unsupported-content',
        ].includes(code);
        session.snapshot = Object.freeze({
          ...session.snapshot,
          segments: Object.freeze(
            session.snapshot.segments.map((item, itemIndex) =>
              itemIndex === index
                ? Object.freeze({
                    ...item,
                    error: message,
                    status: conflict
                      ? ('rollback-conflict' as const)
                      : ('rollback-failed' as const),
                  })
                : item
            )
          ),
        });
        if (conflict) {
          conflicts += 1;
          this.report(
            session.snapshot.pluginId,
            'importer-rollback-conflict',
            error
          );
          continue;
        }
        session.snapshot = Object.freeze({
          ...session.snapshot,
          canCancel: true,
          canRollback: true,
          error: message,
          status: 'rollback-failed',
        });
        this.report(session.snapshot.pluginId, 'importer-rollback', error);
        this.publish();
        return;
      }
    }
    const hasConflicts =
      conflicts > 0 ||
      session.snapshot.segments.some(
        (segment) => segment.status === 'rollback-conflict'
      );
    session.snapshot = Object.freeze({
      ...session.snapshot,
      canCancel: true,
      canRollback: hasConflicts,
      error: hasConflicts
        ? 'Some imported ranges were preserved because their notes changed or are referenced.'
        : null,
      status: hasConflicts ? 'rollback-conflict' : 'rolled-back',
    });
    this.publish();
  }

  private async parseImporterSession(
    session: ImporterSession,
    mapping?: ImporterFieldMapping
  ): Promise<void> {
    const file = session.snapshot.file;
    if (!file) {
      throw new Error('Importer file is not available');
    }
    const empty = Object.freeze([]);
    try {
      const result = await raceImporterAbort(
        Promise.resolve().then(() =>
          session.registration.definition.parse(file, {
            ...(mapping ? { mapping } : {}),
            signal: session.controller.signal,
          })
        ),
        session.controller.signal
      );
      if (!this.isCurrentImporterSession(session)) {
        return;
      }
      const preview = validateImporterParseResult(result);
      session.segmented = preview.segmented;
      session.snapshot = Object.freeze({
        ...session.snapshot,
        canConfirm: true,
        canPrepare: false,
        notes: preview.notes,
        segments: Object.freeze(
          preview.segments.map((segment, index) =>
            Object.freeze({
              end: segment.end,
              error: null,
              index,
              operationId: preview.segmented
                ? `${session.snapshot.operationId}_segment_${index + 1}`
                : session.snapshot.operationId,
              start: segment.start,
              status: 'pending' as const,
            })
          )
        ),
        status: 'preview',
        totalNotes: preview.notes.length,
        warnings: preview.warnings,
      });
      this.publish();
    } catch (error) {
      if (!this.isCurrentImporterSession(session)) {
        return;
      }
      if (
        session.controller.signal.aborted ||
        (error && typeof error === 'object' && 'name' in error
          ? error.name === 'AbortError'
          : false)
      ) {
        this.cancelImporterSessionFor(session.activation, session.registration);
        return;
      }
      session.snapshot = Object.freeze({
        ...session.snapshot,
        canConfirm: false,
        canPrepare: session.configurable,
        error: redactPluginError(error),
        notes: empty,
        segments: empty,
        status: 'failed',
        totalNotes: 0,
        warnings: empty,
      });
      this.report(session.snapshot.pluginId, 'importer-parse', error);
    }
  }

  async startImporterSession(
    pluginId: string,
    importerId: string
  ): Promise<void> {
    const activation = this.activations.get(pluginId);
    const registration = activation?.importers.get(importerId);
    if (!(activation?.active && registration && activation.files)) {
      throw new Error('Importer is not available');
    }
    const activeStatus = this.importSession?.snapshot.status;
    if (activeStatus === 'committing') {
      throw new Error('Import confirmation is in progress');
    }
    if (activeStatus === 'placing' || activeStatus === 'rolling-back') {
      throw new Error('Import placement or rollback is in progress');
    }
    this.cancelImporterSessionFor();
    const controller = new AbortController();
    const empty = Object.freeze([]);
    const operationId = `plgimport_${crypto.randomUUID().replaceAll('-', '')}`;
    const session: ImporterSession = {
      activation,
      committedItems: [],
      configurable: typeof registration.definition.inspectFields === 'function',
      controller,
      registration,
      segmented: false,
      snapshot: Object.freeze({
        canCancel: true,
        canConfirm: false,
        canPrepare: false,
        canRollback: false,
        completedNotes: 0,
        error: null,
        file: null,
        importerId,
        importerTitle: registration.definition.title,
        mapping: null,
        notes: empty,
        operationId,
        pluginId,
        placement: Object.freeze({
          mode: 'detached' as const,
          strategy: 'grid' as const,
          viewId: null,
        }),
        placementTargets: Object.freeze(
          (this.options.placementHost ?? canvasImporterPlacementHost)
            .getTargets()
            .map((target) => Object.freeze({ ...target }))
        ),
        segments: empty,
        sourceFields: empty,
        status: 'selecting',
        totalNotes: 0,
        warnings: empty,
        workspaceId: activation.workspaceId,
      }),
    };
    this.importSession = session;
    this.publish();
    try {
      const files = await activation.files.pick({
        accept: registration.definition.accept,
        signal: controller.signal,
      });
      if (!this.isCurrentImporterSession(session)) {
        return;
      }
      if (files.length === 0) {
        this.cancelImporterSessionFor(activation, registration);
        return;
      }
      if (files.length !== 1) {
        throw new Error('Importer file picker returned more than one file');
      }
      const file = files[0]!;
      session.snapshot = Object.freeze({
        ...session.snapshot,
        file,
        status: 'parsing',
      });
      this.publish();
      if (registration.definition.inspectFields) {
        const inspected = await raceImporterAbort(
          Promise.resolve().then(() =>
            registration.definition.inspectFields!(file, {
              signal: controller.signal,
            })
          ),
          controller.signal
        );
        if (!this.isCurrentImporterSession(session)) {
          return;
        }
        const configuration = validateImporterFieldInspection(inspected);
        session.snapshot = Object.freeze({
          ...session.snapshot,
          canPrepare: configuration.mapping.title !== null,
          mapping: configuration.mapping,
          sourceFields: configuration.fields,
          status: 'configuring',
        });
        this.publish();
        return;
      }
      await this.parseImporterSession(session);
    } catch (error) {
      if (!this.isCurrentImporterSession(session)) {
        return;
      }
      if (
        controller.signal.aborted ||
        (error && typeof error === 'object' && 'name' in error
          ? error.name === 'AbortError'
          : false)
      ) {
        this.cancelImporterSessionFor(activation, registration);
        return;
      }
      session.snapshot = Object.freeze({
        ...session.snapshot,
        canConfirm: false,
        canPrepare: false,
        error: redactPluginError(error),
        notes: empty,
        status: 'failed',
        warnings: empty,
      });
      this.report(pluginId, 'importer-parse', error);
    }
  }

  isCommandEnabled(pluginId: string, id: string): boolean {
    const instance = this.activations.get(pluginId);
    const command = instance?.commands.get(id);
    if (!(instance?.active && command)) {
      return false;
    }
    try {
      return command.definition.enabled?.() ?? true;
    } catch (error) {
      this.report(pluginId, 'enabled', error);
      return false;
    }
  }

  async runCommand(pluginId: string, id: string): Promise<void> {
    const instance = this.activations.get(pluginId);
    const command = instance?.commands.get(id);
    if (!(instance?.active && command)) {
      return;
    }
    if (
      !(this.isCommandEnabled(pluginId, id) && instance.active) ||
      instance.commands.get(id) !== command
    ) {
      return;
    }
    try {
      await command.definition.run();
    } catch (error) {
      this.report(pluginId, 'command', error);
    }
  }

  openPanel(pluginId: string, id: string): void {
    const instance = this.activations.get(pluginId);
    const panel = instance?.panels.get(id);
    if (!(instance?.active && panel) || panel.close) {
      return;
    }
    let release: Disposer | undefined;
    let unmount: Disposer | undefined;
    let element: HTMLElement | undefined;
    const close = this.track(instance, () => {
      if (panel.close === close) {
        panel.close = undefined;
      }
      const tasks: Promise<void>[] = [];
      if (unmount) {
        tasks.push(this.clean(pluginId, unmount));
      }
      element?.replaceChildren();
      if (release) {
        tasks.push(this.clean(pluginId, release));
      }
      this.publish();
      return Promise.all(tasks).then(() => undefined);
    });
    panel.close = close;
    try {
      const mount = (this.options.mountPanel ?? mountFloatingPanel)({
        pluginId,
        panelId: id,
        title: panel.definition.title,
        close: () => this.closePanel(pluginId, id),
      });
      element = mount.element;
      let released = false;
      release = () => {
        if (!released) {
          released = true;
          return mount.dispose();
        }
      };
      if (!instance.active || panel.close !== close) {
        element.replaceChildren();
        this.clean(pluginId, release);
        return;
      }
      unmount = renderPanel(
        element,
        panel.definition,
        (error) => this.report(pluginId, 'panel', error),
        instance.selection
      );
      if (!instance.active || panel.close !== close) {
        if (unmount) {
          this.clean(pluginId, unmount);
        }
        element.replaceChildren();
        this.clean(pluginId, release);
      }
      this.publish();
    } catch (error) {
      this.report(pluginId, 'panel', error);
      close();
    }
  }

  closePanel(pluginId: string, id: string): void {
    this.activations.get(pluginId)?.panels.get(id)?.close?.();
  }

  async reload(pluginId: string): Promise<void> {
    this.revision += 1;
    const instance =
      this.candidates.get(pluginId) ?? this.activations.get(pluginId);
    if (!instance) {
      return;
    }
    this.createActivation(instance.descriptor);
    this.publish();
    await this.candidates.get(pluginId)?.ready;
    await Promise.all(this.retirements.values());
  }

  async dispose(): Promise<void> {
    this.revision += 1;
    for (const detach of this.shortcutDisposers) {
      detach();
    }
    const instances = new Set([
      ...this.activations.values(),
      ...this.candidates.values(),
    ]);
    this.activations.clear();
    this.candidates.clear();
    this.workspaceId = '';
    this.hostDiagnostics = [];
    await Promise.all([...instances].map((instance) => this.retire(instance)));
    await Promise.all(this.retirements.values());
    this.publish();
  }

  attachShortcuts(target: Window = window): () => void {
    const handler = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        isEditingShortcut(event)
      ) {
        return;
      }
      const matches = [...this.activations.values()].flatMap((instance) =>
        [...instance.commands.values()]
          .filter(
            (command) =>
              command.shortcut && matchesShortcut(event, command.shortcut)
          )
          .map((command) => ({ instance, command }))
      );
      if (matches.length > 1) {
        for (const { instance, command } of matches) {
          this.report(
            instance.descriptor.pluginId,
            'shortcut',
            `Conflicting shortcut: ${command.definition.shortcut}`
          );
        }
        return;
      }
      const match = matches[0];
      if (
        !(
          match &&
          this.isCommandEnabled(
            match.instance.descriptor.pluginId,
            match.command.definition.id
          )
        )
      ) {
        return;
      }
      event.preventDefault();
      this.runCommand(
        match.instance.descriptor.pluginId,
        match.command.definition.id
      );
    };
    target.addEventListener('keydown', handler);
    const detach = () => {
      target.removeEventListener('keydown', handler);
      this.shortcutDisposers.delete(detach);
    };
    this.shortcutDisposers.add(detach);
    return detach;
  }
}

export const pluginRuntime = new PluginRuntime();
