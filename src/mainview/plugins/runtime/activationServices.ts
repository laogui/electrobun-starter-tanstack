import type {
  Disposer,
  OperationOptions,
  PluginContext,
  PluginEventMap,
  TaskSchedule,
} from '../../../../packages/plugin-sdk';

const MAX_TIMER_MS = 2_147_483_647;
type EventName = keyof PluginEventMap;
type EventListener = (
  payload: PluginEventMap[EventName]
) => void | Promise<void>;

interface Task {
  cancel: () => void;
  start: () => void;
}

export class ActivationServices {
  private readonly options: {
    assertActive: () => void;
    isPublished: () => boolean;
    report: (phase: string, error: unknown) => void;
    signal: AbortSignal;
    track: (cleanup: Disposer) => Disposer;
    workspaceId: string;
  };
  private readonly listeners = new Map<EventName, Set<EventListener>>();
  private readonly tasks = new Map<string, Task>();

  constructor(options: ActivationServices['options']) {
    this.options = options;
    options.signal.addEventListener(
      'abort',
      () => {
        this.listeners.clear();
        for (const task of this.tasks.values()) {
          task.cancel();
        }
        this.tasks.clear();
      },
      { once: true }
    );
  }

  private get published(): boolean {
    return !this.options.signal.aborted && this.options.isPublished();
  }

  emit<K extends EventName>(event: K, payload: PluginEventMap[K]): void {
    if (!this.published) {
      return;
    }
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      if (!this.published) {
        break;
      }
      if (!this.listeners.get(event)?.has(listener)) {
        continue;
      }
      try {
        Promise.resolve(listener(structuredClone(payload))).catch((error) =>
          this.options.report(`event:${event}`, error)
        );
      } catch (error) {
        this.options.report(`event:${event}`, error);
      }
    }
  }

  publish(): void {
    for (const task of this.tasks.values()) {
      task.start();
    }
    this.emit('workspace.activated', { workspaceId: this.options.workspaceId });
  }

  readonly events: PluginContext['events'] = {
    on: <K extends EventName>(
      event: K,
      listener: (payload: PluginEventMap[K]) => void | Promise<void>,
      options?: OperationOptions
    ): Disposer => {
      this.options.assertActive();
      if (
        ![
          'content.changed',
          'selection.changed',
          'workspace.activated',
        ].includes(event) ||
        typeof listener !== 'function'
      ) {
        throw new Error('Invalid plugin event or listener');
      }
      if (options?.signal?.aborted) {
        return () => undefined;
      }
      const subscribers = this.listeners.get(event) ?? new Set<EventListener>();
      // Each registration owns its disposer, even when callbacks are identical.
      const wrapped: EventListener = (payload) =>
        listener(payload as PluginEventMap[K]);
      subscribers.add(wrapped);
      this.listeners.set(event, subscribers);
      const cancel = () => {
        subscribers.delete(wrapped);
      };
      options?.signal?.addEventListener('abort', cancel, { once: true });
      return this.options.track(() => {
        cancel();
        options?.signal?.removeEventListener('abort', cancel);
      });
    },
  };

  readonly scheduledTasks: PluginContext['tasks'] = {
    schedule: (
      id: string,
      schedule: TaskSchedule,
      run: () => void | Promise<void>
    ): Disposer => {
      this.options.assertActive();
      if (
        typeof id !== 'string' ||
        !id.trim() ||
        typeof run !== 'function' ||
        !schedule ||
        typeof schedule !== 'object'
      ) {
        throw new Error('Task requires an id, schedule and callback');
      }
      if (this.tasks.has(id)) {
        throw new Error(`Duplicate task id: ${id}`);
      }
      const every = schedule.every;
      const at = schedule.at;
      if (
        (every !== undefined) === (at !== undefined) ||
        (every !== undefined && (!Number.isSafeInteger(every) || every <= 0)) ||
        (at !== undefined &&
          !(at instanceof Date && Number.isFinite(at.getTime())))
      ) {
        throw new Error(
          'Task schedule requires positive integer every milliseconds or a valid Date'
        );
      }
      let deadline = at?.getTime() ?? 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let cancelled = false;
      let started = false;
      let busy = false;
      const cancel = () => {
        cancelled = true;
        clearTimeout(timer);
      };
      const arm = () => {
        if (cancelled || !this.published) {
          return;
        }
        timer = setTimeout(
          tick,
          Math.min(MAX_TIMER_MS, Math.max(0, deadline - Date.now()))
        );
      };
      const tick = () => {
        if (cancelled || !this.published) {
          return;
        }
        const now = Date.now();
        if (now < deadline) {
          arm();
          return;
        }
        if (every !== undefined) {
          // Advance past missed periods without queuing catch-up executions.
          deadline += (Math.floor((now - deadline) / every) + 1) * every;
          arm();
        }
        if (busy) {
          return;
        }
        busy = true;
        Promise.resolve()
          .then(() => {
            if (!cancelled && this.published) {
              return run();
            }
          })
          .catch((error) => this.options.report(`task:${id}`, error))
          .finally(() => {
            busy = false;
          });
      };
      const task: Task = {
        cancel,
        start: () => {
          if (started || cancelled || !this.published) {
            return;
          }
          started = true;
          if (every !== undefined) {
            deadline = Date.now() + every;
          } else if (deadline < Date.now()) {
            return;
          }
          arm();
        },
      };
      this.tasks.set(id, task);
      task.start();
      return this.options.track(() => {
        cancel();
        if (this.tasks.get(id) === task) {
          this.tasks.delete(id);
        }
      });
    },
  };
}
