import {
  newQuickJSWASMModule,
  type QuickJSContext,
  type QuickJSDeferredPromise,
  type QuickJSHandle,
  type QuickJSRuntime,
  shouldInterruptAfterDeadline,
} from 'quickjs-emscripten';

import {
  PLUGIN_CONTROL_MESSAGE_MAX_BYTES,
  type PluginHostCallMethod,
} from '../../shared/plugins/protocol';

const DEFAULT_TIMEOUT_MS = 2000;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_MEMORY_LIMIT_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_STACK_SIZE_BYTES = 512 * 1024;
const DEFAULT_MAX_HOST_CALLS = 256;
const MAX_PENDING_JOB_TURNS = 1000;
const MAX_JSON_BYTES = PLUGIN_CONTROL_MESSAGE_MAX_BYTES;
const EXPORT_NAME_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const TIMEOUT_ERROR_RE = /interrupted|timed out|timeout/i;
const RESOURCE_ERROR_RE =
  /out of memory|memory limit|stack overflow|allocation/i;
const HOST_ERROR_RE = /^\[plugin-error:([a-z-]+)\]\s*(.*)$/su;
const STRICT_JSON_STRINGIFY_SOURCE = `((value) => JSON.stringify(value, (_key, entry) => {
  if (
    typeof entry === 'bigint' ||
    typeof entry === 'function' ||
    typeof entry === 'symbol' ||
    (typeof entry === 'number' && !Number.isFinite(entry))
  ) {
    throw new TypeError('control values must contain JSON values');
  }
  return entry;
}))`;

export interface QuickJSHostCall {
  args: unknown;
  method: PluginHostCallMethod;
}

export interface QuickJSExecutionInput {
  exportName: string;
  hostCall: (call: QuickJSHostCall) => PromiseLike<unknown> | unknown;
  maxHostCalls?: number;
  maxStackSizeBytes?: number;
  memoryLimitBytes?: number;
  operationId?: string;
  source: string;
  timeoutMs?: number;
}

export interface QuickJSExecutionResult {
  hostCalls: QuickJSHostCall[];
  value: unknown;
}

export type QuickJSRuntimeFailureCode =
  | 'permission-denied'
  | 'protocol-error'
  | 'runtime-unavailable'
  | 'unsupported-capability'
  | 'timeout'
  | 'resource-limit';

export class QuickJSRuntimeFailure extends Error {
  readonly code: QuickJSRuntimeFailureCode;

  constructor(code: QuickJSRuntimeFailureCode, message: string) {
    super(message);
    this.name = 'QuickJSRuntimeFailure';
    this.code = code;
  }
}

/**
 * Execute one plugin handler in a fresh QuickJS WASM module.
 *
 * The guest receives only explicit JSON-shaped API values and host functions.
 * It is never given a Node/Bun object, a HostRef, a module object, or a
 * require/import loader. A new WASM module is created for every invocation so
 * guest globals and runtime state cannot be shared with another invocation.
 */
export async function runQuickJSHandler(
  input: QuickJSExecutionInput
): Promise<QuickJSExecutionResult> {
  assertExportName(input.exportName);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxHostCalls = input.maxHostCalls ?? DEFAULT_MAX_HOST_CALLS;
  const memoryLimitBytes = input.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES;
  const maxStackSizeBytes =
    input.maxStackSizeBytes ?? DEFAULT_MAX_STACK_SIZE_BYTES;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new QuickJSRuntimeFailure(
      'protocol-error',
      `timeoutMs must be between 1 and ${MAX_TIMEOUT_MS}`
    );
  }
  if (!Number.isSafeInteger(maxHostCalls) || maxHostCalls < 0) {
    throw new QuickJSRuntimeFailure(
      'protocol-error',
      'maxHostCalls must be a non-negative integer'
    );
  }
  if (!Number.isSafeInteger(memoryLimitBytes) || memoryLimitBytes <= 0) {
    throw new QuickJSRuntimeFailure(
      'protocol-error',
      'memoryLimitBytes must be a positive integer'
    );
  }
  if (!Number.isSafeInteger(maxStackSizeBytes) || maxStackSizeBytes <= 0) {
    throw new QuickJSRuntimeFailure(
      'protocol-error',
      'maxStackSizeBytes must be a positive integer'
    );
  }
  const deadline = Date.now() + timeoutMs;
  const hostCalls: QuickJSHostCall[] = [];
  const module = await newQuickJSWASMModule();
  const runtime = module.newRuntime();
  const context = runtime.newContext();
  const bridgeState: GuestBridgeState = { active: true, pending: new Set() };
  runtime.setMemoryLimit(memoryLimitBytes);
  runtime.setMaxStackSize(maxStackSizeBytes);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(deadline));

  try {
    const stringifyResult = context.evalCode(
      STRICT_JSON_STRINGIFY_SOURCE,
      'json-boundary.js'
    );
    const strictStringify = context.unwrapResult(stringifyResult);
    try {
      const handler = evaluateHandler(context, input.source, input.exportName);
      const api = createGuestApi(
        context,
        input,
        hostCalls,
        maxHostCalls,
        strictStringify,
        bridgeState
      );
      try {
        const callResult = context.callFunction(
          handler,
          context.undefined,
          api.handle
        );
        const callValue = context.unwrapResult(callResult);
        try {
          const value = await resolveGuestValue(
            context,
            runtime,
            callValue,
            strictStringify,
            deadline
          );
          return { value, hostCalls };
        } finally {
          callValue.dispose();
        }
      } finally {
        api.dispose();
        handler.dispose();
      }
    } finally {
      strictStringify.dispose();
    }
  } catch (error) {
    throw normalizeRuntimeError(error, deadline);
  } finally {
    bridgeState.active = false;
    for (const deferred of bridgeState.pending) {
      deferred.dispose();
    }
    bridgeState.pending.clear();
    context.dispose();
    runtime.dispose();
  }
}

function assertExportName(exportName: string): void {
  if (!EXPORT_NAME_RE.test(exportName)) {
    throw new QuickJSRuntimeFailure(
      'protocol-error',
      `handler export is not a valid identifier: ${exportName}`
    );
  }
}

function evaluateHandler(
  context: QuickJSContext,
  source: string,
  exportName: string
): QuickJSHandle {
  const normalized = source
    .replace(/\bexport\s+async\s+function\b/gu, 'async function')
    .replace(/\bexport\s+function\b/gu, 'function');
  const result = context.evalCode(
    `(function () {\n${normalized}\nreturn typeof ${exportName} === 'function' ? ${exportName} : undefined;\n})()`,
    'plugin.js'
  );
  const handler = context.unwrapResult(result);
  if (context.typeof(handler) !== 'function') {
    handler.dispose();
    throw new QuickJSRuntimeFailure(
      'protocol-error',
      `handler export is missing: ${exportName}`
    );
  }
  return handler;
}

function createGuestApi(
  context: QuickJSContext,
  input: QuickJSExecutionInput,
  hostCalls: QuickJSHostCall[],
  maxHostCalls: number,
  strictStringify: QuickJSHandle,
  bridgeState: GuestBridgeState
): { dispose: () => void; handle: QuickJSHandle } {
  const api = context.newObject();
  const content = context.newObject();
  const operationId = input.operationId
    ? context.newString(input.operationId)
    : undefined;

  const readSelection = context.newFunction(
    'readSelection',
    (...args: QuickJSHandle[]) =>
      callHost(
        context,
        input,
        hostCalls,
        maxHostCalls,
        strictStringify,
        bridgeState,
        'content.readSelection',
        args
      )
  );
  const applyBatch = context.newFunction(
    'applyBatch',
    (...args: QuickJSHandle[]) =>
      callHost(
        context,
        input,
        hostCalls,
        maxHostCalls,
        strictStringify,
        bridgeState,
        'content.applyBatch',
        args
      )
  );
  context.setProp(content, 'readSelection', readSelection);
  context.setProp(content, 'applyBatch', applyBatch);
  context.setProp(api, 'content', content);
  if (operationId) {
    context.setProp(api, 'operationId', operationId);
  }

  return {
    handle: api,
    dispose() {
      readSelection.dispose();
      applyBatch.dispose();
      operationId?.dispose();
      content.dispose();
      api.dispose();
    },
  };
}

function callHost(
  context: QuickJSContext,
  input: QuickJSExecutionInput,
  hostCalls: QuickJSHostCall[],
  maxHostCalls: number,
  strictStringify: QuickJSHandle,
  bridgeState: GuestBridgeState,
  method: PluginHostCallMethod,
  args: QuickJSHandle[]
): QuickJSHandle {
  try {
    if (hostCalls.length >= maxHostCalls) {
      throw Object.assign(
        new Error(
          `plugin command exceeded the ${maxHostCalls} host-call limit`
        ),
        { code: 'resource-limit' }
      );
    }
    const call = {
      method,
      args: args[0]
        ? serializeGuestValue(context, strictStringify, args[0])
        : undefined,
    };
    hostCalls.push(call);
    const value = input.hostCall(call);
    if (isPromiseLike(value)) {
      return createGuestPromise(context, value, bridgeState);
    }
    return toGuestValue(context, value);
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : 'runtime-unavailable';
    const message = error instanceof Error ? error.message : String(error);
    throw Object.assign(new Error(`[plugin-error:${code}] ${message}`), {
      code,
    });
  }
}

interface GuestBridgeState {
  active: boolean;
  pending: Set<QuickJSDeferredPromise>;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function createGuestPromise(
  context: QuickJSContext,
  value: PromiseLike<unknown>,
  bridgeState: GuestBridgeState
): QuickJSHandle {
  const deferred = context.newPromise();
  bridgeState.pending.add(deferred);
  Promise.resolve(value)
    .then(
      (resolved) => {
        if (!bridgeState.active) {
          return;
        }
        try {
          const guestValue = toGuestValue(context, resolved);
          try {
            deferred.resolve(guestValue);
          } finally {
            guestValue.dispose();
          }
        } catch (error) {
          rejectGuestPromise(context, deferred, error);
        }
      },
      (error: unknown) => {
        if (bridgeState.active) {
          rejectGuestPromise(context, deferred, error);
        }
      }
    )
    .finally(() => {
      const wasPending = bridgeState.pending.delete(deferred);
      if (!bridgeState.active && wasPending) {
        deferred.dispose();
      }
    });
  return deferred.handle;
}

function rejectGuestPromise(
  context: QuickJSContext,
  deferred: QuickJSDeferredPromise,
  error: unknown
): void {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : 'runtime-unavailable';
  const message = error instanceof Error ? error.message : String(error);
  const errorHandle = context.newError(`[plugin-error:${code}] ${message}`);
  try {
    deferred.reject(errorHandle);
  } finally {
    errorHandle.dispose();
  }
}

function toGuestValue(context: QuickJSContext, value: unknown): QuickJSHandle {
  const serialized = stringifyHostValue(value);
  if (serialized === null) {
    throw new QuickJSRuntimeFailure(
      'protocol-error',
      'host call returned a non-JSON value'
    );
  }
  if (serialized === undefined) {
    return context.undefined;
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_JSON_BYTES) {
    throw new QuickJSRuntimeFailure(
      'resource-limit',
      'host call result exceeds 256 KiB'
    );
  }
  const result = context.evalCode(`(${serialized})`, 'host-result.json');
  return context.unwrapResult(result);
}

async function resolveGuestValue(
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  handle: QuickJSHandle,
  strictStringify: QuickJSHandle,
  deadline: number
): Promise<unknown> {
  for (let turn = 0; turn < MAX_PENDING_JOB_TURNS; turn++) {
    const state = context.getPromiseState(handle);
    if (state.type === 'fulfilled') {
      try {
        return serializeGuestValue(context, strictStringify, state.value);
      } finally {
        if (!state.notAPromise) {
          state.value.dispose();
        }
      }
    }
    if (state.type === 'rejected') {
      const error = context.dump(state.error);
      state.error.dispose();
      throw new Error(formatGuestError(error));
    }
    if (Date.now() >= deadline) {
      throw new QuickJSRuntimeFailure(
        'timeout',
        'plugin command timed out while awaiting a guest promise'
      );
    }
    const jobs = runtime.executePendingJobs(-1);
    if (jobs.error) {
      const error = context.dump(jobs.error);
      jobs.error.dispose();
      throw new Error(formatGuestError(error));
    }
    jobs.dispose();
    if (!runtime.hasPendingJob()) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  throw new QuickJSRuntimeFailure(
    'resource-limit',
    'plugin command exceeded the pending job limit'
  );
}

function serializeGuestValue(
  context: QuickJSContext,
  strictStringify: QuickJSHandle,
  value: QuickJSHandle
): unknown {
  const result = context.callFunction(
    strictStringify,
    context.undefined,
    value
  );
  let serialized: QuickJSHandle | undefined;
  try {
    serialized = context.unwrapResult(result);
    if (context.typeof(serialized) === 'undefined') {
      return;
    }
    const json = context.getString(serialized);
    if (new TextEncoder().encode(json).byteLength > MAX_JSON_BYTES) {
      throw new QuickJSRuntimeFailure(
        'resource-limit',
        'guest value exceeds 256 KiB'
      );
    }
    return JSON.parse(json) as unknown;
  } catch (error) {
    if (error instanceof QuickJSRuntimeFailure) {
      throw error;
    }
    throw new QuickJSRuntimeFailure(
      'protocol-error',
      'guest value is not serializable JSON'
    );
  } finally {
    serialized?.dispose();
  }
}

function stringifyHostValue(value: unknown): string | null | undefined {
  try {
    return JSON.stringify(value, (_key, entry: unknown) => {
      if (
        typeof entry === 'bigint' ||
        typeof entry === 'function' ||
        typeof entry === 'symbol' ||
        (typeof entry === 'number' && !Number.isFinite(entry))
      ) {
        throw new Error('control values must contain JSON values');
      }
      return entry;
    });
  } catch {
    return null;
  }
}

function formatGuestError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return String(error);
}

function normalizeRuntimeError(error: unknown, deadline: number): Error {
  if (error instanceof QuickJSRuntimeFailure) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const hostError = HOST_ERROR_RE.exec(message);
  if (hostError) {
    const code = hostError[1];
    if (
      code === 'permission-denied' ||
      code === 'protocol-error' ||
      code === 'unsupported-capability' ||
      code === 'resource-limit' ||
      code === 'timeout' ||
      code === 'runtime-unavailable'
    ) {
      return new QuickJSRuntimeFailure(code, hostError[2] ?? message);
    }
  }
  const code =
    Date.now() >= deadline || TIMEOUT_ERROR_RE.test(message)
      ? 'timeout'
      : RESOURCE_ERROR_RE.test(message)
        ? 'resource-limit'
        : error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : 'runtime-unavailable';
  if (
    code === 'permission-denied' ||
    code === 'unsupported-capability' ||
    code === 'protocol-error'
  ) {
    return new QuickJSRuntimeFailure(code, message);
  }
  return new QuickJSRuntimeFailure(
    code === 'timeout' || code === 'resource-limit'
      ? code
      : 'runtime-unavailable',
    message
  );
}
