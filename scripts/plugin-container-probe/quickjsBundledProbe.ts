import { runQuickJSHandler } from '../../src/bun/plugins/quickjsRuntime';

export async function runBundledQuickJSProbe() {
  const hostCalls: Array<{ args: unknown; method: string }> = [];
  const hostCall = (call: { args: unknown; method: string }) => {
    hostCalls.push(call);
    if (call.method === 'content.readSelection') {
      return {
        items: [{ revision: 1, title: 'Bundled', token: 'sel_bundled' }],
      };
    }
    throw Object.assign(new Error(`unsupported host call: ${call.method}`), {
      code: 'unsupported-capability',
    });
  };

  const boundary = await runQuickJSHandler({
    exportName: 'run',
    hostCall,
    operationId: 'op_bundled_probe',
    source: `export async function run(ctx) {
      const selected = await ctx.content.readSelection({ fields: ['title'] });
      return {
        hostProcessVisible: typeof process !== 'undefined',
        hostBunVisible: typeof Bun !== 'undefined',
        hostRequireVisible: typeof require !== 'undefined',
        selected,
      };
    }`,
  });
  const interrupted = await captureFailure(
    runQuickJSHandler({
      exportName: 'run',
      hostCall,
      source: 'export function run() { while (true) {} }',
      timeoutMs: 100,
    })
  );
  const hostFlood = await captureFailure(
    runQuickJSHandler({
      exportName: 'run',
      hostCall,
      maxHostCalls: 8,
      source: `export function run(ctx) {
        for (let index = 0; index < 100; index++) {
          ctx.content.readSelection({ index });
        }
      }`,
    })
  );
  return {
    bun: Bun.version,
    boundary: {
      hostCalls: boundary.hostCalls,
      value: boundary.value,
    },
    hostCalls,
    hostFlood,
    interrupted,
    platform: process.platform,
    arch: process.arch,
  };
}

async function captureFailure(promise: Promise<unknown>) {
  try {
    await promise;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code:
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : 'unknown',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
