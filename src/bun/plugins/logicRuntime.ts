import { runInNewContext } from 'node:vm';
import type { PluginRuntimeSession } from '../../shared/plugins/session';
import {
  invokeCommand,
  receivePluginMessage,
} from '../../shared/plugins/session';
import { PluginDirectoryError } from './loadDirectory';
import type { ProbeHost } from './probeHost';

const EXPORT_ASYNC_FN_RE = /\bexport\s+async\s+function\b/g;
const EXPORT_FN_RE = /\bexport\s+function\b/g;

export interface CommandRunResult {
  preview?: Array<{ title: string; token: string }>;
  value: unknown;
}

function toCjs(source: string, exportName: string): string {
  return `${source.replace(EXPORT_ASYNC_FN_RE, 'async function').replace(EXPORT_FN_RE, 'function')}
module.exports = { ${exportName} };
`;
}

function loadHandler(
  source: string,
  exportName: string
): (ctx: unknown) => Promise<unknown> {
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(toCjs(source, exportName), {
    module,
    exports: module.exports,
    console,
    require() {
      throw new Error('require is not available to plugins');
    },
  });
  const handler = module.exports[exportName];
  if (typeof handler !== 'function') {
    throw new PluginDirectoryError(
      'missing-handler',
      `handler export is missing: ${exportName}`
    );
  }
  return handler as (ctx: unknown) => Promise<unknown>;
}

function createCommandContext(session: PluginRuntimeSession, probe: ProbeHost) {
  const operationId =
    session.context.kind === 'operation'
      ? session.context.operationId
      : undefined;
  return {
    operationId,
    content: {
      async readSelection(args: unknown) {
        const received = receivePluginMessage(session, {
          type: 'host-call',
          payload: { method: 'content.readSelection', args },
        });
        if (!received.ok) {
          throw Object.assign(new Error(received.error.message), {
            code: received.error.code,
          });
        }
        return probe.readSelection();
      },
      async applyBatch(args: unknown) {
        const received = receivePluginMessage(session, {
          type: 'host-call',
          payload: { method: 'content.applyBatch', args },
        });
        if (!received.ok) {
          throw Object.assign(new Error(received.error.message), {
            code: received.error.code,
          });
        }
        throw Object.assign(new Error('title rewrite is not available in P0'), {
          code: 'unsupported-capability',
        });
      },
    },
  };
}

export async function runPluginCommand(input: {
  commandId: string;
  probe: ProbeHost;
  session: PluginRuntimeSession;
  source: string;
}): Promise<CommandRunResult> {
  const command = input.session.manifest.contributes.commands.find(
    (entry) => entry.id === input.commandId
  );
  if (!command) {
    throw new PluginDirectoryError(
      'missing-handler',
      `unknown command: ${input.commandId}`
    );
  }
  const exportName = command.handler.split('#')[1];
  if (!exportName) {
    throw new PluginDirectoryError(
      'missing-handler',
      `command handler is missing an export: ${command.handler}`
    );
  }
  const invoked = invokeCommand(input.session, input.commandId);
  if ('code' in invoked) {
    throw Object.assign(new Error(invoked.message), { code: invoked.code });
  }
  const handler = loadHandler(input.source, exportName);
  const value = await handler(createCommandContext(input.session, input.probe));
  if (invoked.requestId) {
    receivePluginMessage(input.session, {
      type: 'response',
      requestId: invoked.requestId,
      payload: value,
    });
  }
  const preview =
    value &&
    typeof value === 'object' &&
    'preview' in value &&
    Array.isArray(value.preview)
      ? (value.preview as Array<{ title: string; token: string }>)
      : undefined;
  return preview ? { value, preview } : { value };
}
