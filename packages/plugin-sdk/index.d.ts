import type { ComponentType } from 'react';

export type Disposer = () => void | Promise<void>;

export interface CommandDefinition {
  enabled?: () => boolean;
  id: string;
  run: () => void | Promise<void>;
  /** For example Mod+Shift+J. Host shortcuts and text editing take priority. */
  shortcut?: string;
  title: string;
}

export type PanelDefinition = {
  id: string;
  title: string;
} & (
  | { component: ComponentType; mount?: never }
  // biome-ignore lint/suspicious/noConfusingVoidType: Side-effect-only mounts may return no disposer.
  | { component?: never; mount: (element: HTMLElement) => void | Disposer }
);

export interface PluginContext {
  readonly commands: {
    register(command: CommandDefinition): Disposer;
  };
  /** Increases for each activation attempt; failed reloads do not reset it. */
  readonly generation: number;
  /** Registers a cleanup; the returned disposer also runs it early, once. */
  onCleanup(disposer: Disposer): Disposer;
  readonly panels: {
    register(panel: PanelDefinition): Disposer;
    open(id: string): void;
    close(id: string): void;
  };
  readonly pluginId: string;
  /** Aborted on retirement, not when a replacement merely starts preparing. */
  readonly signal: AbortSignal;
  readonly workers: {
    /** The returned disposer terminates the worker; disable also terminates it. */
    track(worker: Worker): Disposer;
  };
  readonly workspaceId: string;
}

export interface PluginDefinition {
  // biome-ignore lint/suspicious/noConfusingVoidType: Async setup also supports plugins with no cleanup return.
  setup(app: PluginContext): void | Disposer | Promise<void | Disposer>;
}

export declare function definePlugin<T extends PluginDefinition>(
  definition: T
): T;
