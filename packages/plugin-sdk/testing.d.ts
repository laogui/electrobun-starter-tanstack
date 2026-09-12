import type {
  CanvasTypeDefinition,
  CommandDefinition,
  Disposer,
  ImporterDefinition,
  JsonValue,
  PanelDefinition,
  PluginContext,
  PluginEventMap,
  PluginFileHandle,
  SelectionSnapshot,
  TaskSchedule,
} from './index.js';

export interface FakeHostOptions {
  pluginId: string;
  workspaceId: string;
}

export type FakeHostFactory = (
  app: PluginContext
) => undefined | Disposer | Promise<undefined | Disposer>;

export interface FakeHostInspection {
  readonly canvasTypes: readonly CanvasTypeDefinition[];
  readonly cleanupCount: number;
  readonly commands: readonly CommandDefinition[];
  readonly generation: number;
  readonly importers: readonly ImporterDefinition[];
  readonly openPanels: readonly string[];
  readonly panels: readonly PanelDefinition[];
  readonly signal: AbortSignal;
  readonly tasks: readonly {
    id: string;
    run: () => void | Promise<void>;
    schedule: TaskSchedule;
  }[];
}

export interface FakeHostHarness {
  readonly behavior: {
    abort(): Promise<void>;
    emit<K extends keyof PluginEventMap>(
      event: K,
      payload: PluginEventMap[K]
    ): Promise<void>;
    parseImporter(
      id: string,
      file: PluginFileHandle
    ): ReturnType<ImporterDefinition['parse']>;
    runCommand(id: string): Promise<void>;
    runTask(id: string): Promise<void>;
    setSelection(snapshot: SelectionSnapshot): void;
  };
  readonly files: {
    addText(
      name: string,
      text: string,
      options?: { lastModified?: number; mimeType?: string }
    ): PluginFileHandle;
    queuePick(...handles: PluginFileHandle[]): void;
  };
  readonly inspection: FakeHostInspection;
  readonly lifecycle: {
    dispose(): Promise<void>;
    reload(factory: FakeHostFactory): Promise<PluginContext>;
  };
}

export interface FakeHost {
  readonly app: PluginContext;
  readonly harness: FakeHostHarness;
}

export declare function createFakeHost(options: FakeHostOptions): FakeHost;

export type { JsonValue };
