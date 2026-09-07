import { runInNewContext } from 'node:vm';
import { parentPort } from 'node:worker_threads';

const pending = new Map();

function hostCall(method, args) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    parentPort?.postMessage({ type: 'host-call', requestId, method, args });
  });
}

async function runCommand(message) {
  const module = { exports: {} };
  runInNewContext(message.source, {
    module,
    exports: module.exports,
    console,
    require() {
      throw new Error('require is not available to plugins');
    },
  });
  const handler = module.exports[message.exportName];
  if (typeof handler !== 'function') {
    throw new Error(`handler export is missing: ${message.exportName}`);
  }
  const value = await handler({
    operationId: message.operationId,
    content: {
      readSelection: (args) => hostCall('content.readSelection', args),
      applyBatch: (args) => hostCall('content.applyBatch', args),
    },
  });
  parentPort?.postMessage({ type: 'result', value });
}

parentPort?.on('message', (message) => {
  if (message.type === 'host-result') {
    const waiter = pending.get(message.requestId);
    pending.delete(message.requestId);
    if (!waiter) {
      return;
    }
    if (message.error) {
      waiter.reject(
        Object.assign(new Error(message.error.message), {
          code: message.error.code,
        })
      );
      return;
    }
    waiter.resolve(message.value);
    return;
  }
  if (message.type === 'run') {
    runCommand(message).catch((error) => {
      parentPort?.postMessage({
        type: 'crash',
        code: error?.code ?? 'runtime-unavailable',
        message: error?.message ?? 'plugin worker failed',
      });
    });
  }
});
