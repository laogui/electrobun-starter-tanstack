import { describe, expect, it, vi } from 'vitest';

import { runQuickJSHandler } from './quickjsRuntime';

function execute(
  source: string,
  options: Partial<Parameters<typeof runQuickJSHandler>[0]> = {}
) {
  return runQuickJSHandler({
    exportName: 'run',
    hostCall: vi.fn((call) => {
      if (call.method === 'content.readSelection') {
        return {
          items: [{ revision: 3, title: '  Hello   world ', token: 'sel_a' }],
        };
      }
      throw Object.assign(new Error(`unsupported: ${call.method}`), {
        code: 'unsupported-capability',
      });
    }),
    operationId: 'op_test',
    source,
    ...options,
  });
}

describe('QuickJS plugin runtime', () => {
  it('exposes only the explicit JSON host boundary', async () => {
    const result = await execute(`
      export async function run(ctx) {
        const selected = await ctx.content.readSelection({ fields: ['title'] });
        return {
          process: typeof process,
          bun: typeof Bun,
          require: typeof require,
          operationId: ctx.operationId,
          selected,
        };
      }
    `);

    expect(result.value).toEqual({
      process: 'undefined',
      bun: 'undefined',
      require: 'undefined',
      operationId: 'op_test',
      selected: {
        items: [{ revision: 3, title: '  Hello   world ', token: 'sel_a' }],
      },
    });
    expect(result.hostCalls).toEqual([
      {
        method: 'content.readSelection',
        args: { fields: ['title'] },
      },
    ]);
  });

  it('bridges asynchronous host results without exposing host promises', async () => {
    const result = await execute(
      `export async function run(ctx) {
        const selected = await ctx.content.readSelection({ fields: ['title'] });
        return selected.items.length;
      }`,
      {
        hostCall: vi.fn(async () => ({
          items: [{ revision: 1, title: 'Async', token: 'sel_async' }],
        })),
      }
    );

    expect(result.value).toBe(1);
  });

  it('interrupts synchronous loops and unresolved guest promises', async () => {
    await expect(
      execute('export function run() { while (true) {} }', { timeoutMs: 100 })
    ).rejects.toMatchObject({ code: 'timeout' });
    await expect(
      execute('export async function run() { await new Promise(() => {}); }', {
        timeoutMs: 100,
      })
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('disposes an unresolved asynchronous host call after timeout', async () => {
    await expect(
      execute(
        `export async function run(ctx) {
          await ctx.content.readSelection({ fields: ['title'] });
        }`,
        {
          hostCall: () => new Promise<never>(() => {}),
          timeoutMs: 100,
        }
      )
    ).rejects.toMatchObject({ code: 'timeout' });
    await expect(
      execute('export function run() { return 7; }')
    ).resolves.toMatchObject({ value: 7 });
  });

  it('ignores a host promise that settles after its runtime was disposed', async () => {
    await expect(
      execute(
        'export async function run(ctx) { await ctx.content.readSelection(); }',
        {
          hostCall: () =>
            new Promise((resolve) => {
              setTimeout(() => resolve({ items: [] }), 50);
            }),
          timeoutMs: 10,
        }
      )
    ).rejects.toMatchObject({ code: 'timeout' });
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('limits synchronous host-call floods before they reach the host', async () => {
    const hostCall = vi.fn(() => ({ items: [] }));
    await expect(
      execute(
        `export function run(ctx) {
          for (let index = 0; index < 10; index++) {
            ctx.content.readSelection({ index });
          }
          return true;
        }`,
        { hostCall, maxHostCalls: 3 }
      )
    ).rejects.toMatchObject({ code: 'resource-limit' });
    expect(hostCall).toHaveBeenCalledTimes(3);
    await expect(
      execute('export function run() { return true; }', { maxHostCalls: -1 })
    ).rejects.toMatchObject({ code: 'protocol-error' });
    await expect(
      execute('export function run() { return true; }', {
        timeoutMs: Number.NaN,
      })
    ).rejects.toMatchObject({ code: 'protocol-error' });
    await expect(
      execute('export function run() { return true; }', {
        timeoutMs: 0.5,
      })
    ).rejects.toMatchObject({ code: 'protocol-error' });
  });

  it('enforces a per-runtime memory limit and rejects invalid exports', async () => {
    await expect(
      execute(
        `export function run() { return 'x'.repeat(32 * 1024 * 1024); }`,
        { memoryLimitBytes: 2 * 1024 * 1024 }
      )
    ).rejects.toMatchObject({ code: 'resource-limit' });
    await expect(
      runQuickJSHandler({
        exportName: 'missing',
        hostCall: () => undefined,
        source: 'export function run() { return 1; }',
      })
    ).rejects.toMatchObject({ code: 'protocol-error' });
  });

  it('bounds host results at the same size as control messages', async () => {
    await expect(
      execute(
        'export async function run(ctx) { return ctx.content.readSelection(); }',
        {
          hostCall: vi.fn(() => ({ value: 'x'.repeat(300 * 1024) })),
        }
      )
    ).rejects.toMatchObject({ code: 'resource-limit' });
  });

  it('starts each invocation with a fresh global object', async () => {
    await expect(
      execute(`
        export function run() {
          globalThis.marker = 'first';
          return globalThis.marker;
        }
      `)
    ).resolves.toMatchObject({ value: 'first' });
    await expect(
      execute(`
        export function run() {
          return typeof globalThis.marker === 'undefined';
        }
      `)
    ).resolves.toMatchObject({ value: true });
  });
});
