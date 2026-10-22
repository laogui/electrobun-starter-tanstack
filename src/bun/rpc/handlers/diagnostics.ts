import { reportErrorSchema } from '../../../shared/support/reports';
import { appState } from '../../appState';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createDiagnosticsHandlers(
  _ctx: RpcContext
): RpcRequestHandlers<
  | 'getDiagnosticsStatus'
  | 'getDiagnosticsPreview'
  | 'setCrashAutoUpload'
  | 'submitFeedback'
  | 'recordRendererDiagnostic'
> {
  return {
    getDiagnosticsStatus: () =>
      appState.diagnostics?.status() ?? {
        autoUpload: false,
        configured: false,
        pendingReports: 0,
      },

    getDiagnosticsPreview: () => ({
      logs: appState.diagnostics?.preview() ?? '',
    }),

    setCrashAutoUpload: ({ enabled }) => {
      if (typeof enabled !== 'boolean' || !appState.diagnostics) {
        throw new Error('Diagnostics unavailable');
      }
      return appState.diagnostics.setAutoUpload(enabled);
    },

    submitFeedback: (input) =>
      appState.diagnostics?.submitFeedback(input) ?? {
        success: false as const,
        error: 'unavailable' as const,
      },

    recordRendererDiagnostic: ({ level, message, crash }) => {
      if (
        !(appState.diagnostics && ['warn', 'error'].includes(level)) ||
        typeof message !== 'string'
      ) {
        return { success: false };
      }
      appState.diagnostics.record(level, 'renderer', message.slice(0, 4096));
      if (crash) {
        const parsed = reportErrorSchema.safeParse(crash);
        if (parsed.success && parsed.data.source === 'renderer') {
          appState.diagnostics.captureCrash(parsed.data);
        }
      }
      return { success: true };
    },
  };
}
