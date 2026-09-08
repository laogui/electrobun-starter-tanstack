import {
  type QuickJSExecutionResult,
  runQuickJSHandler,
} from '../../src/bun/plugins/quickjsRuntime';

const selection = {
  items: [
    { revision: 3, title: '  Hello   world ', token: 'sel_a' },
    { revision: 1, title: 'Notes', token: 'sel_b' },
  ],
};

const hostCalls: Array<{ args: unknown; method: string }> = [];
const hostCall = (call: { args: unknown; method: string }) => {
  hostCalls.push(call);
  if (call.method === 'content.readSelection') {
    return selection;
  }
  throw Object.assign(new Error(`unsupported host call: ${call.method}`), {
    code: 'unsupported-capability',
  });
};

async function runCase(
  name: string,
  source: string,
  options: Partial<Parameters<typeof runQuickJSHandler>[0]> = {}
) {
  try {
    const result = await runQuickJSHandler({
      exportName: 'run',
      hostCall,
      operationId: 'op_quickjs_probe',
      source,
      ...options,
    });
    return {
      name,
      ok: true,
      result: serializeResult(result),
    };
  } catch (error) {
    return {
      name,
      ok: false,
      error: {
        code:
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : 'unknown',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function serializeResult(result: QuickJSExecutionResult) {
  return {
    hostCalls: result.hostCalls,
    value: result.value,
  };
}

const cases = [
  await runCase(
    'explicit-host-boundary',
    `export async function run(ctx) {
      const selected = await ctx.content.readSelection({ fields: ['title'] });
      return {
        hostProcessVisible: typeof process !== 'undefined',
        hostBunVisible: typeof Bun !== 'undefined',
        hostRequireVisible: typeof require !== 'undefined',
        operationId: ctx.operationId,
        selected,
      };
    }`
  ),
  await runCase(
    'infinite-loop-interrupt',
    `export function run() {
      while (true) {}
    }`,
    { timeoutMs: 100 }
  ),
  await runCase(
    'unsettled-promise-interrupt',
    `export async function run() {
      await new Promise(() => {});
      return 'never';
    }`,
    { timeoutMs: 100 }
  ),
  await runCase(
    'guest-bigint-rejected',
    `export function run() {
      return { value: 1n };
    }`
  ),
  await runCase(
    'host-bigint-argument-rejected',
    `export function run(ctx) {
      return ctx.content.readSelection({ value: 1n });
    }`
  ),
  await runCase(
    'host-circular-argument-rejected',
    `export function run(ctx) {
      const value = {};
      value.self = value;
      return ctx.content.readSelection(value);
    }`
  ),
  await runCase(
    'host-call-flood-limited',
    `export function run(ctx) {
      for (let index = 0; index < 100; index++) {
        ctx.content.readSelection({ index });
      }
      return true;
    }`,
    { maxHostCalls: 8 }
  ),
  await runCase(
    'memory-limit',
    `export function run() {
      return 'x'.repeat(32 * 1024 * 1024);
    }`,
    { memoryLimitBytes: 2 * 1024 * 1024, timeoutMs: 1000 }
  ),
  await runCase(
    'fresh-runtime-state',
    `export function run() {
      globalThis.probeMarker = 'first-runtime';
      return globalThis.probeMarker;
    }`
  ),
  await runCase(
    'fresh-runtime-does-not-leak',
    `export function run() {
      return typeof globalThis.probeMarker === 'undefined';
    }`
  ),
];

console.log(
  'PLUGIN_QUICKJS_RESULT',
  JSON.stringify(
    {
      bun: Bun.version,
      cases,
      hostCalls,
      platform: process.platform,
      arch: process.arch,
      date: new Date().toISOString(),
    },
    null,
    2
  )
);
