import type { PluginHostCallMethod } from '../../shared/plugins/protocol';
import type { PluginRuntimeSession } from '../../shared/plugins/session';
import {
  crashSession,
  invokeCommand,
  receivePluginMessage,
  timeoutRequest,
} from '../../shared/plugins/session';
import { PluginDirectoryError } from './loadDirectory';
import type { ProbeHost } from './probeHost';
import {
  type QuickJSRuntimeFailureCode,
  runQuickJSHandler,
} from './quickjsRuntime';

export interface CommandRunResult {
  preview?: Array<{ title: string; token: string }>;
  value: unknown;
}

/**
 * Run one command in a fresh QuickJS WASM module.
 *
 * QuickJS is the only untrusted-code path. The older Worker/Node VM prototype
 * is intentionally not used: its constructor canary exposed Bun and process
 * through a guest-supplied object. Host capabilities cross this boundary only
 * as validated JSON values and explicit methods.
 */
export async function runPluginCommand(input: {
  commandId: string;
  probe: ProbeHost;
  session: PluginRuntimeSession;
  source: string;
  timeoutMs?: number;
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

  try {
    const executed = await runQuickJSHandler({
      exportName,
      hostCall: ({ args, method }) =>
        dispatchHostCall(input.session, input.probe, method, args),
      operationId:
        input.session.context.kind === 'operation'
          ? input.session.context.operationId
          : undefined,
      source: input.source,
      timeoutMs: input.timeoutMs,
    });
    const received = receivePluginMessage(input.session, {
      type: 'response',
      requestId: invoked.requestId,
      payload: executed.value,
    });
    if (!received.ok) {
      throw pluginError(received.error.code, received.error.message);
    }
    const preview =
      executed.value &&
      typeof executed.value === 'object' &&
      'preview' in executed.value &&
      Array.isArray(executed.value.preview)
        ? (executed.value.preview as Array<{ title: string; token: string }>)
        : undefined;
    return preview
      ? { value: executed.value, preview }
      : { value: executed.value };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = String(error.code);
      if (code === 'timeout' && invoked.requestId) {
        timeoutRequest(input.session, invoked.requestId);
      }
    }
    crashSession(input.session);
    throw error;
  }
}

function dispatchHostCall(
  session: PluginRuntimeSession,
  probe: ProbeHost,
  method: PluginHostCallMethod,
  args: unknown
): unknown {
  const received = receivePluginMessage(session, {
    type: 'host-call',
    requestId: crypto.randomUUID(),
    payload: { method, args },
  });
  if (!received.ok) {
    throw pluginError(received.error.code, received.error.message);
  }
  if (method === 'content.readSelection') {
    return probe.readSelection();
  }
  if (method === 'content.applyBatch') {
    if (!probe.applyBatch) {
      throw pluginError(
        'unsupported-capability',
        'content.applyBatch is not available on this host'
      );
    }
    return probe.applyBatch(args);
  }
  throw pluginError('unsupported-capability', `no probe for ${method}`);
}

function pluginError(
  code: QuickJSRuntimeFailureCode | string,
  message: string
) {
  return Object.assign(new Error(`[plugin-error:${code}] ${message}`), {
    code,
  });
}
