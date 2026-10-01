import {
  diagnosticValue,
  type ReportError,
  redactDiagnostics,
} from '../../shared/support/reports';
import { rpcRecordRendererDiagnostic } from './rpc';

let emitCrash:
  | ((error: unknown, componentStack?: string | null) => void)
  | null = null;

export function reportRendererError(
  error: unknown,
  componentStack?: string | null
) {
  emitCrash?.(error, componentStack);
}

export function startRendererDiagnostics(): () => void {
  if (!('__electrobunWebviewId' in globalThis)) {
    return () => {};
  }
  let count = 0;
  let windowStart = Date.now();
  let disposed = false;
  const send = (
    message: string,
    level: 'warn' | 'error',
    crash?: ReportError
  ) => {
    if (Date.now() - windowStart > 60_000) {
      count = 0;
      windowStart = Date.now();
    }
    if (disposed || ++count > 100) {
      return;
    }
    rpcRecordRendererDiagnostic({
      level,
      message: redactDiagnostics(message).slice(0, 4096),
      crash,
    }).catch(() => {});
  };
  const crash = (error: unknown, componentStack?: string | null) => {
    const report: ReportError = {
      source: 'renderer',
      name: (error instanceof Error ? error.name : 'UnhandledError').slice(
        0,
        128
      ),
      message: redactDiagnostics(
        error instanceof Error ? error.message : diagnosticValue(error)
      ).slice(0, 4096),
      stack: redactDiagnostics(
        `${error instanceof Error ? (error.stack ?? '') : ''}\n${componentStack ?? ''}`
      ).slice(0, 16_384),
    };
    send(`${report.name}: ${report.message}`, 'error', report);
  };
  emitCrash = crash;
  const onError = (event: ErrorEvent) => {
    if (event.message) {
      crash(event.error ?? new Error(event.message));
    }
  };
  const onRejection = (event: PromiseRejectionEvent) => crash(event.reason);
  globalThis.addEventListener('error', onError);
  globalThis.addEventListener('unhandledrejection', onRejection);
  const originalWarn = console.warn;
  const originalError = console.error;
  const warn = (...values: unknown[]) => {
    originalWarn(...values);
    send(values.map(diagnosticValue).join(' '), 'warn');
  };
  const logError = (...values: unknown[]) => {
    originalError(...values);
    send(values.map(diagnosticValue).join(' '), 'error');
  };
  console.warn = warn;
  console.error = logError;
  return () => {
    disposed = true;
    emitCrash = null;
    globalThis.removeEventListener('error', onError);
    globalThis.removeEventListener('unhandledrejection', onRejection);
    if (console.warn === warn) {
      console.warn = originalWarn;
    }
    if (console.error === logError) {
      console.error = originalError;
    }
  };
}
