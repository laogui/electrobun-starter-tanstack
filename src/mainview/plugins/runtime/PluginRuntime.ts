import type {
  CanvasTypeDefinition,
  CommandDefinition,
  Disposer,
  PanelDefinition,
  PlacementSelectionSnapshot,
  PluginContext,
  PluginDefinition,
  PluginEventMap,
} from '../../../../packages/plugin-sdk';
import type {
  PluginRuntimeDescriptor,
  PluginRuntimeSnapshot,
} from '../../../shared/plugins/runtime';
import { canvasTypeRegistry } from '../../extensions/registry';
import type { AnyBuiltinCanvasType } from '../../extensions/types';
import { ActivationServices } from './activationServices';
import { createPluginContent } from './content';
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
  importer?: (url: string) => Promise<unknown>;
  mountPanel?: MountPanel;
  onDiagnostic?: (diagnostic: RuntimeDiagnostic) => void;
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

interface Activation {
  active: boolean;
  cancel: () => void;
  cancelled: Promise<void>;
  canvasTypes: Map<string, AnyBuiltinCanvasType>;
  cleanups: Set<Disposer>;
  commands: Map<string, CommandRegistration>;
  controller: AbortController;
  descriptor: PluginRuntimeDescriptor;
  generation: number;
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
  private workspaceId = '';
  private revision = 0;
  private snapshot: RuntimeViewSnapshot = {
    workspaceId: '',
    plugins: [],
    canvasTypes: [],
    commands: [],
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
      status: 'loading',
      generation,
      controller: new AbortController(),
      canvasTypes: new Map(),
      commands: new Map(),
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
    instance.controller.abort();
    instance.commands.clear();
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
