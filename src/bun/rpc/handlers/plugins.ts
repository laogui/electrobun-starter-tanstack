import { Utils } from 'electrobun/bun';
import { pluginPickerFileTypes } from '../../plugins/files';
import { pluginInstallErrorMessage } from '../../plugins/management';
import { scriptedProbeSelection } from '../../plugins/probeSelection';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createPluginsHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  | 'pluginInstallList'
  | 'pluginPrepareInstallFromFile'
  | 'pluginPrepareDevelopmentDirectory'
  | 'pluginPrepareInstallFromUrl'
  | 'pluginPrepareUpdate'
  | 'pluginCommitInstall'
  | 'pluginCancelInstall'
  | 'pluginEnable'
  | 'pluginDisable'
  | 'pluginRollback'
  | 'pluginRestoreMigrationBackup'
  | 'pluginSafeModePrepareNormalStart'
  | 'pluginFilesPick'
  | 'pluginFilesReadText'
  | 'pluginFilesListDirectory'
  | 'pluginFilesRelease'
> {
  const { pluginManagement, pluginFiles, pluginStartupGuard } = ctx;
  return {
    pluginInstallList: async () => ({
      plugins: await pluginManagement.list(),
      safeMode: pluginStartupGuard?.getState() ?? {
        active: false,
        nextStart: 'normal',
      },
    }),

    pluginPrepareInstallFromFile: async () => {
      const selected = await Utils.openFileDialog({
        allowedFileTypes: '*',
        allowsMultipleSelection: false,
        canChooseDirectory: false,
        canChooseFiles: true,
        startingFolder: '~/',
      });
      const filePath = selected.find(Boolean);
      if (!filePath) {
        return { success: false, cancelled: true };
      }
      try {
        return {
          success: true,
          preview: await pluginManagement.prepareFromFile(filePath),
        };
      } catch (error) {
        return { success: false, error: pluginInstallErrorMessage(error) };
      }
    },

    pluginPrepareDevelopmentDirectory: async () => {
      const selected = await Utils.openFileDialog({
        allowedFileTypes: '*',
        allowsMultipleSelection: false,
        canChooseDirectory: true,
        canChooseFiles: false,
        startingFolder: '~/',
      });
      const directory = selected.find(Boolean);
      if (!directory) {
        return { success: false, cancelled: true };
      }
      try {
        return {
          success: true,
          preview:
            await pluginManagement.prepareDevelopmentDirectory(directory),
        };
      } catch (error) {
        return { success: false, error: pluginInstallErrorMessage(error) };
      }
    },

    pluginPrepareInstallFromUrl: async ({ url }) => {
      try {
        return {
          success: true,
          preview: await pluginManagement.prepareFromUrl(url),
        };
      } catch (error) {
        return { success: false, error: pluginInstallErrorMessage(error) };
      }
    },

    pluginPrepareUpdate: async ({ digest, pluginId }) => {
      try {
        return {
          success: true,
          preview: await pluginManagement.prepareUpdate({
            digest,
            pluginId,
          }),
        };
      } catch (error) {
        return { success: false, error: pluginInstallErrorMessage(error) };
      }
    },

    pluginCommitInstall: async ({ transactionId }) => {
      try {
        return {
          success: true,
          plugin: await pluginManagement.commit(transactionId),
        };
      } catch (error) {
        return { success: false, error: pluginInstallErrorMessage(error) };
      }
    },

    pluginCancelInstall: async ({ transactionId }) => {
      try {
        await pluginManagement.cancel(transactionId);
        return { success: true };
      } catch (error) {
        console.warn('[plugins] Failed to cancel install:', error);
        return { success: false };
      }
    },

    pluginEnable: async ({ digest, pluginId }) => {
      try {
        const plugin = await pluginManagement.enable({
          digest,
          pluginId,
        });
        return { success: true, plugin };
      } catch (error) {
        return { success: false, error: pluginInstallErrorMessage(error) };
      }
    },

    pluginDisable: async ({ digest, pluginId }) => {
      try {
        const plugin = await pluginManagement.disable({
          digest,
          pluginId,
        });
        return { success: true, plugin };
      } catch (error) {
        return { success: false, error: pluginInstallErrorMessage(error) };
      }
    },

    pluginRollback: async ({ digest, pluginId }) => {
      try {
        return {
          success: true,
          plugin: await pluginManagement.rollback({ digest, pluginId }),
        };
      } catch (error) {
        return { success: false, error: pluginInstallErrorMessage(error) };
      }
    },

    pluginRestoreMigrationBackup: async ({ pluginId }) => {
      try {
        return {
          success: true,
          ...(await pluginManagement.restoreMigrationBackup(pluginId)),
        };
      } catch (error) {
        return { success: false, error: pluginInstallErrorMessage(error) };
      }
    },

    pluginSafeModePrepareNormalStart: async () => {
      if (!pluginStartupGuard) {
        return {
          success: true,
          safeMode: { active: false, nextStart: 'normal' },
        };
      }
      try {
        return {
          success: true,
          safeMode: await pluginStartupGuard.prepareNormalStart(),
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Could not prepare a normal plugin start.',
        };
      }
    },

    pluginFilesPick: async (request) => {
      try {
        pluginFiles.validateContext(request);
        const kind = request.kind ?? 'file';
        if (kind === 'directory' && request.multiple) {
          throw new Error(
            'Directory selection does not support multiple items.'
          );
        }
        const selected =
          scriptedProbeSelection(process.env, kind) ??
          (await Utils.openFileDialog({
            allowedFileTypes:
              kind === 'file' ? pluginPickerFileTypes(request.extensions) : '*',
            allowsMultipleSelection:
              kind === 'file' && request.multiple === true,
            canChooseDirectory: kind === 'directory',
            canChooseFiles: kind === 'file',
            startingFolder: '~/Documents',
          }));
        const paths = selected.filter(Boolean);
        if (paths.length === 0) {
          return { success: false, cancelled: true };
        }
        return {
          success: true,
          files: await pluginFiles.registerSelection(request, paths, kind),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    pluginFilesReadText: async (request) => {
      try {
        return {
          success: true,
          text: await pluginFiles.readText(request, request.handleId),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    pluginFilesListDirectory: async (request) => {
      try {
        return await pluginFiles.listDirectory(request);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    pluginFilesRelease: async (request) => {
      try {
        pluginFiles.release(request, request.handleIds);
        return { success: true };
      } catch {
        return { success: false };
      }
    },
  };
}
