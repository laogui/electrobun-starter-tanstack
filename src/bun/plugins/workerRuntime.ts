import { Worker } from 'node:worker_threads';

import type { PluginHostCallMethod } from '../../shared/plugins/protocol';
import type { PluginRuntimeSession } from '../../shared/plugins/session';
import {
  crashSession,
  invokeCommand,
  receivePluginMessage,
  timeoutRequest,
} from '../../shared/plugins/session';
import { compileHandlerSource } from './compileHandler';
import { PluginDirectoryError } from './loadDirectory';
import type { CommandRunResult } from './logicRuntime';
import type { ProbeHost } from './probeHost';

const WORKER_PATH = new URL('./pluginWorker.mjs', import.meta.url);

export async function runPluginCommandInWorker(input: {
  commandId: string;
  probe: ProbeHost;
  session: PluginRuntimeSession;
  source: string;
  timeoutMs: number;
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

  const worker = new Worker(WORKER_PATH);
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (invoked.requestId) {
          timeoutRequest(input.session, invoked.requestId);
        }
        worker.terminate();
        reject(
          Object.assign(new Error('plugin command timed out'), {
            code: 'timeout',
          })
        );
      }, input.timeoutMs);

      worker.on(
        'message',
        (message: {
          args?: unknown;
          code?: string;
          message?: string;
          method?: string;
          requestId?: string;
          type?: string;
          value?: unknown;
        }) => {
          if (message.type === 'host-call') {
            const received = receivePluginMessage(input.session, {
              type: 'host-call',
              payload: {
                method: message.method as PluginHostCallMethod,
                args: message.args,
              },
            });
            if (!received.ok) {
              worker.postMessage({
                type: 'host-result',
                requestId: message.requestId,
                error: received.error,
              });
              return;
            }
            if (message.method === 'content.readSelection') {
              worker.postMessage({
                type: 'host-result',
                requestId: message.requestId,
                value: input.probe.readSelection(),
              });
              return;
            }
            worker.postMessage({
              type: 'host-result',
              requestId: message.requestId,
              error: {
                code: 'unsupported-capability',
                message: `no probe for ${message.method}`,
              },
            });
            return;
          }
          if (message.type === 'result') {
            clearTimeout(timer);
            resolve(message.value);
            return;
          }
          if (message.type === 'crash') {
            clearTimeout(timer);
            crashSession(input.session);
            reject(
              Object.assign(new Error(message.message ?? 'plugin crashed'), {
                code: message.code ?? 'runtime-unavailable',
              })
            );
          }
        }
      );

      worker.on('error', (error) => {
        clearTimeout(timer);
        crashSession(input.session);
        reject(error);
      });

      worker.postMessage({
        type: 'run',
        source: compileHandlerSource(input.source, exportName),
        exportName,
        operationId:
          input.session.context.kind === 'operation'
            ? input.session.context.operationId
            : undefined,
      });
    });

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
  } finally {
    await worker.terminate();
  }
}
