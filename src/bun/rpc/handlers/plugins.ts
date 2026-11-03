import { Utils } from 'electrobun/bun';
import { pluginPickerFileTypes } from '../../plugins/files';
import { pluginInstallErrorMessage } from '../../plugins/management';
import { isPluginPermission } from '../../plugins/permissions';
import { probeEnv } from '../../plugins/probeGate';
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
  | 'pluginRemove'
  | 'pluginRollback'
  | 'pluginRestoreMigrationBackup'
  | 'pluginSafeModePrepareNormalStart'
  | 'pluginFilesPick'
  | 'pluginFilesReadText'
  | 'pluginFilesListDirectory'
  | 'pluginFilesRelease'
  | 'pluginPermissionsList'
  | 'pluginPermissionsRevoke'
> {
  const {
    pluginManagement,
    pluginFiles,
    pluginPermissions,
    pluginStartupGuard,
  } = ctx;
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

    pluginRemove: async ({ digest, pluginId }) => {
      try {
        await pluginManagement.remove({ digest, pluginId });
        pluginFiles.revokePlugin(pluginId);
        return { success: true };
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
        const validCaller = () =>
          typeof request.hostToken === 'string' &&
          ctx.resolvePluginCaller?.(request.hostToken) === request.pluginId;
        if (!validCaller()) {
          throw new Error(
            'File picker caller credential does not match this plugin.'
          );
        }
        pluginFiles.validateContext(request);
        const kind = request.kind ?? 'file';
        if (kind === 'directory' && request.multiple) {
          throw new Error(
            'Directory selection does not support multiple items.'
          );
        }
        const scripted = scriptedProbeSelection(probeEnv(), kind);
        // Main-process consent before any native picker opens for a plugin.
        // Handles minted below are the only way to reach the plugin file
        // read/write routes, so this gates them too. A scripted selection
        // (probe harness) never skips it: the gate itself auto-allows only
        // the harness's fixture IDs.
        if (
          !(await pluginPermissions.check(
            request.pluginId,
            kind === 'directory' ? 'files.directory' : 'files.read'
          ))
        ) {
          return {
            success: false,
            error: 'Permission denied: file access was not allowed.',
          };
        }
        const selected =
          scripted ??
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
        if (
          !(
            validCaller() &&
            (await pluginManagement.list()).some(
              (plugin) =>
                plugin.pluginId === request.pluginId &&
                plugin.enabled &&
                plugin.status === 'stored'
            )
          )
        ) {
          throw new Error('Plugin was disabled while choosing files.');
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

    // Grants are created only by the native prompt; renderer code can list
    // and revoke them but there is deliberately no grant RPC.
    pluginPermissionsList: async () => ({
      grants: await pluginPermissions.list(),
    }),

    pluginPermissionsRevoke: async ({ permission, pluginId }) => {
      if (permission !== undefined && !isPluginPermission(permission)) {
        return { success: false };
      }
      await pluginPermissions.revoke(pluginId, permission);
      if (permission === undefined || permission.startsWith('files.')) {
        pluginFiles.revokePlugin(pluginId);
      }
      return { success: true };
    },
  };
}
