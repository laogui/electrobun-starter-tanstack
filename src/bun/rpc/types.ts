import type { BrowserView } from 'electrobun/bun';
import type {
  AIConnectionSettings,
  AIProvider,
  AITestResult,
} from '../../shared/ai/providerConfig';
import type { AIRunTaskParams, AIRunTaskResponse } from '../../shared/ai/types';
import type { ExtensionEnablementFile } from '../../shared/extensions/enablement';
import type {
  ExtensionInstanceLoadError,
  ExtensionInstanceRecord,
} from '../../shared/extensions/instance';
import type { ExtensionPresentation } from '../../shared/extensions/presentation';
import type { ExtensionTaskDelivery } from '../../shared/extensions/scheduling';
import type { HostContentChangedEvent } from '../../shared/plugins/contentHistory';
import type {
  PluginDirectoryListResult,
  PluginFilePickResult,
  PluginFileReadResult,
} from '../../shared/plugins/files';
import type {
  InstalledPluginSummary,
  PluginInstallCommitResult,
  PluginInstallPreparationResult,
  PluginMigrationRestoreResult,
  PluginSafeModePreparationResult,
  PluginSafeModeState,
  PluginUpdatePreparationResult,
} from '../../shared/plugins/management';
import type {
  DiagnosticsStatus,
  FeedbackInput,
  ReportError,
  SubmitReportResult,
} from '../../shared/support/reports';
import type { OpenAttachmentResult } from '../attachments';
import type { UnlinkedFileEntry } from '../cleanup';
import type { LicenseInfo } from '../license';
import type { ManifestEdge, ManifestNode } from '../manifest';
import type {
  NodeMetadata,
  NodeMetadataMap,
  TagMutationResult,
  TagSummary,
} from '../nodeMetadata';
import type { PluginPermissionGrant } from '../plugins/permissions';
import type { PreviewArtifacts } from '../preview';
import type { SearchResult } from '../search';
import type { AppSettings } from '../settings';
import type {
  TemplateManifest,
  TemplateMeta,
  WriteTemplateThumbnailResult,
} from '../templates';
import type { WidgetKind, WidgetLoadError, WidgetRecord } from '../widgets';
import type { TrashEntry } from '../workspace';

export interface CanvasRPC {
  bun: {
    requests: {
      loadCanvas: {
        params: { viewId: string };
        response: {
          nodes: ManifestNode[];
          edges: ManifestEdge[];
          widgets?: Record<string, WidgetRecord | WidgetLoadError>;
          extensionInstances?: Record<
            string,
            ExtensionInstanceRecord | ExtensionInstanceLoadError
          >;
          /**
           * Set when the manifest on disk was unreadable and this content
           * came from that backup (e.g. `views/x.canvas.json.bak`). The
           * renderer should warn before autosave keeps it.
           */
          recoveredFrom?: string;
          /** Where the unreadable manifest bytes were preserved. */
          backupPath?: string;
        } | null;
      };
      saveManifest: {
        params: {
          viewId: string;
          nodes: ManifestNode[];
          edges: ManifestEdge[];
        };
        response: { success: boolean };
      };
      createWidget: {
        params: { kind: WidgetKind; title?: string };
        response: { success: true; widget: WidgetRecord } | { success: false };
      };
      cloneWidget: {
        params: { widgetId: string };
        response: { success: true; widget: WidgetRecord } | { success: false };
      };
      saveWidget: {
        params: { widget: WidgetRecord };
        response: { success: boolean };
      };
      deleteWidget: {
        params: { widgetId: string };
        response: { success: boolean };
      };
      pluginInstallList: {
        params: Record<string, unknown>;
        response: {
          plugins: InstalledPluginSummary[];
          safeMode: PluginSafeModeState;
        };
      };
      pluginPrepareInstallFromFile: {
        params: Record<string, unknown>;
        response: PluginInstallPreparationResult;
      };
      pluginPrepareDevelopmentDirectory: {
        params: Record<string, unknown>;
        response: PluginInstallPreparationResult;
      };
      pluginPrepareInstallFromUrl: {
        params: { url: string };
        response: PluginInstallPreparationResult;
      };
      pluginPrepareUpdate: {
        params: { digest: string; pluginId: string };
        response: PluginUpdatePreparationResult;
      };
      pluginCommitInstall: {
        params: { transactionId: string };
        response: PluginInstallCommitResult;
      };
      pluginCancelInstall: {
        params: { transactionId: string };
        response: { success: boolean };
      };
      pluginEnable: {
        params: { digest: string; pluginId: string };
        response: PluginInstallCommitResult;
      };
      pluginDisable: {
        params: { digest: string; pluginId: string };
        response: PluginInstallCommitResult;
      };
      pluginRollback: {
        params: { digest: string; pluginId: string };
        response: PluginInstallCommitResult;
      };
      pluginRestoreMigrationBackup: {
        params: { pluginId: string };
        response: PluginMigrationRestoreResult;
      };
      pluginSafeModePrepareNormalStart: {
        params: Record<string, unknown>;
        response: PluginSafeModePreparationResult;
      };
      pluginFilesPick: {
        params: {
          activationId: string;
          extensions: string[];
          kind?: 'directory' | 'file';
          multiple?: boolean;
          pluginId: string;
          workspaceId: string;
        };
        response: PluginFilePickResult;
      };
      pluginFilesReadText: {
        params: {
          activationId: string;
          handleId: string;
          pluginId: string;
          workspaceId: string;
        };
        response: PluginFileReadResult;
      };
      pluginFilesListDirectory: {
        params: {
          activationId: string;
          cursor?: string;
          handleId: string;
          limit?: number;
          pluginId: string;
          workspaceId: string;
        };
        response: PluginDirectoryListResult;
      };
      pluginPermissionsList: {
        params: Record<string, unknown>;
        response: { grants: PluginPermissionGrant[] };
      };
      pluginPermissionsRevoke: {
        params: { permission?: string; pluginId: string };
        response: { success: boolean };
      };
      pluginFilesRelease: {
        params: {
          activationId: string;
          handleIds: string[];
          pluginId: string;
          workspaceId: string;
        };
        response: { success: boolean };
      };
      extensionEnablementList: {
        params: Record<string, unknown>;
        response: {
          disabledCanvasTypes: string[];
          instanceCounts: Record<string, number>;
        };
      };
      extensionEnablementSetEnabled: {
        params: { canvasTypeId: string; enabled: boolean };
        response: {
          enablement?: ExtensionEnablementFile;
          success: boolean;
        };
      };
      extensionInstanceCreate: {
        params: {
          canvasTypeId: string;
          dataVersion: number;
          id?: string;
          presentation: ExtensionPresentation;
          state: unknown;
        };
        response:
          | { record: ExtensionInstanceRecord; success: true }
          | { success: false };
      };
      extensionInstanceLoadMany: {
        params: { instanceIds: string[] };
        response: {
          records: Record<
            string,
            ExtensionInstanceRecord | ExtensionInstanceLoadError
          >;
        };
      };
      extensionInstanceUpdate: {
        params: {
          dataVersion?: number;
          expectedRevision?: number;
          instanceId: string;
          presentation: ExtensionPresentation;
          state: unknown;
        };
        response:
          | { record: ExtensionInstanceRecord; success: true }
          | { success: false };
      };
      extensionInstanceClone: {
        params: { instanceId: string };
        response:
          | { record: ExtensionInstanceRecord; success: true }
          | { success: false };
      };
      extensionInstanceClearType: {
        params: { canvasTypeId: string };
        response: { deleted: number; success: boolean };
      };
      extensionSchedulerSchedule: {
        params: {
          canvasTypeId: string;
          fireAt: string;
          id: string;
          instanceId: string;
          payload?: unknown;
          repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
        };
        response: { success: boolean };
      };
      extensionSchedulerCancel: {
        params: { instanceId: string; taskId: string };
        response: { success: boolean };
      };
      extensionSchedulerAck: {
        params: { deliveryId: string };
        response: { success: boolean };
      };
      extensionSchedulerList: {
        params: { instanceId?: string };
        response: {
          diagnostic?: string;
          tasks: Array<{
            canvasTypeId: string;
            fireAt: string;
            id: string;
            instanceId: string;
            payload?: unknown;
            repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
          }>;
        };
      };
      saveNote: {
        params: {
          noteId: string;
          frontmatter: Record<string, unknown>;
          body: string;
        };
        response: { preview?: PreviewArtifacts; success: boolean };
      };
      loadBlockNote: {
        params: { noteId: string; workspaceId?: string };
        response: {
          success: boolean;
          blocks?: unknown[];
          markdown?: string;
          frontmatter?: Record<string, unknown>;
          revision?: number;
          recoveredFromMarkdown?: boolean;
          preview?: PreviewArtifacts;
          text?: string;
          workspaceId?: string;
        };
      };
      saveBlockNote: {
        params: {
          noteId: string;
          frontmatter: Record<string, unknown>;
          blocks: unknown[];
          markdown: string;
          revision?: number;
        };
        response: {
          success: boolean;
          conflict?: boolean;
          revision?: number;
          preview?: PreviewArtifacts;
          blocknoteFile?: string;
        };
      };
      createNote: {
        params: { id: string; title: string; displayHint: string };
        response: { noteId: string; file: string };
      };
      deleteNote: {
        params: { noteId: string };
        response: { success: boolean };
      };
      saveAttachment: {
        params: {
          dataUrl: string;
          existingFile?: string;
          kind?: 'audio' | 'file' | 'image' | 'video';
          mimeType?: string;
          suggestedName?: string;
        };
        response: {
          archiveSummary?: { entryCount: number; topFiles: string[] };
          filePath: string;
          previewExcerpt?: string;
        };
      };
      saveAttachmentFile: {
        params: {
          sourcePath: string;
          kind?: 'audio' | 'file' | 'image' | 'video';
          mimeType?: string;
          suggestedName?: string;
        };
        response: {
          archiveSummary?: { entryCount: number; topFiles: string[] };
          filePath: string;
          previewExcerpt?: string;
        };
      };
      loadAttachment: {
        params: { filePath: string };
        response: { dataUrl: string } | null;
      };
      openAttachment: {
        params: { filePath: string };
        response: OpenAttachmentResult;
      };
      revealAttachment: {
        params: { filePath: string };
        response: { success: boolean };
      };
      openExternalUrl: {
        params: { url: string };
        response: { success: boolean };
      };
      toggleWindowMaximize: {
        params: Record<string, unknown>;
        response: { maximized: boolean; success: boolean };
      };
      importMarkdownFiles: {
        params: Record<string, unknown>;
        response: {
          canceled?: boolean;
          failedCount?: number;
          notes: Array<{ noteId: string; title: string; content?: string }>;
        };
      };
      generateVideoThumbnail: {
        params: { attachmentFile: string };
        response: { thumbnailFile?: string };
      };

      exportPng: {
        params: { dataUrl: string; fileName: string };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      exportJson: {
        params: { fileName: string; json: string };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      exportNoteMarkdown: {
        params: { noteId: string; includeFrontmatter?: boolean };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      /** Topic outline export. The renderer projects the tree to Markdown —
       *  it holds the live graph — and the main process only saves it. */
      exportTopicOutline: {
        params: { fileName: string; markdown: string };
        response: { canceled?: boolean; filePath?: string; success: boolean };
      };
      exportNotesMarkdown: {
        params: {
          scope: 'all' | 'selected' | 'view';
          viewId?: string;
          noteIds?: string[];
          includeFrontmatter?: boolean;
        };
        response: {
          canceled?: boolean;
          exported?: number;
          failed?: number;
          filePath?: string;
          success: boolean;
        };
      };
      getSettings: {
        params: Record<string, unknown>;
        response: AppSettings;
      };
      getDiagnosticsStatus: {
        params: Record<string, unknown>;
        response: DiagnosticsStatus;
      };
      getDiagnosticsPreview: {
        params: Record<string, unknown>;
        response: { logs: string };
      };
      setCrashAutoUpload: {
        params: { enabled: boolean };
        response: DiagnosticsStatus;
      };
      submitFeedback: {
        params: FeedbackInput;
        response: SubmitReportResult;
      };
      recordRendererDiagnostic: {
        params: {
          level: 'warn' | 'error';
          message: string;
          crash?: ReportError;
        };
        response: { success: boolean };
      };
      saveSettings: {
        params: AppSettings;
        response: { success: boolean };
      };
      getAICredentialStatus: {
        params: { provider?: AIProvider };
        response: {
          hasApiKey: boolean;
          source: 'stored' | 'environment' | 'none';
        };
      };
      testAIConnection: {
        params: AIConnectionSettings;
        response: AITestResult;
      };
      setAIApiKey: {
        params: { apiKey: string | null; provider?: AIProvider };
        response: { success: boolean };
      };
      aiRunTask: {
        params: AIRunTaskParams;
        response: AIRunTaskResponse;
      };
      listTrash: {
        params: Record<string, unknown>;
        response: TrashEntry[];
      };
      restoreTrash: {
        params: { trashId: string };
        response: { success: boolean };
      };
      purgeTrash: {
        params: { trashId: string };
        response: { success: boolean };
      };
      clearAllTrash: {
        params: Record<string, unknown>;
        response: { purged: number; success: boolean };
      };
      scanUnlinkedNotes: {
        params: Record<string, unknown>;
        response: { entries: UnlinkedFileEntry[] };
      };
      deleteUnlinkedNotes: {
        params: { files: string[] };
        response: { deleted: string[]; skipped: string[] };
      };
      getWorkspaceInfo: {
        params: Record<string, unknown>;
        response: WorkspaceInfoResponse;
      };
      openWorkspaceFolder: {
        params: Record<string, unknown>;
        response: { success: boolean };
      };
      switchWorkspace: {
        params: Record<string, unknown>;
        response: SwitchWorkspaceResponse;
      };
      exportWorkspaceArchive: {
        params: Record<string, unknown>;
        response: ExportArchiveResponse;
      };
      getAppInfo: {
        params: Record<string, unknown>;
        response: AppInfoResponse;
      };
      checkForUpdate: {
        params: Record<string, unknown>;
        response: UpdateCheckResponse;
      };
      checkLicense: {
        params: Record<string, unknown>;
        response: LicenseInfo;
      };
      activateLicense: {
        params: { key: string };
        response: { success: boolean; error?: string };
      };
      getLocalHttpEndpoint: {
        params: Record<string, unknown>;
        response: {
          aiEnabled: boolean;
          baseUrl: string;
          mediaToken: string;
          token: string;
        };
      };
      listViews: {
        params: Record<string, unknown>;
        response: {
          views: Array<{ id: string; name: string; file: string }>;
          activeViewId: string;
        };
      };
      createView: {
        params: { name: string };
        response: { id: string; name: string; file: string };
      };
      deleteView: {
        params: { viewId: string };
        response: {
          success: boolean;
          activeViewId?: string;
          trashId?: string;
        };
      };
      restoreView: {
        params: { trashId: string };
        response: {
          success: boolean;
          view?: { id: string; name: string; file: string };
          activeViewId?: string;
        };
      };
      renameView: {
        params: { viewId: string; name: string };
        response: { success: boolean };
      };
      setActiveView: {
        params: { viewId: string };
        response: { success: boolean };
      };
      searchCanvas: {
        params: {
          query: string;
          viewId?: string;
          limit?: number;
        };
        response: SearchResult[];
      };
      listTags: {
        params: Record<string, unknown>;
        response: TagSummary[];
      };
      renameTag: {
        params: { oldName: string; newName: string };
        response: TagMutationResult;
      };
      deleteTag: {
        params: { name: string };
        response: TagMutationResult;
      };
      loadNodeMetadata: {
        params: Record<string, unknown>;
        response: NodeMetadataMap;
      };
      setNodeMetadata: {
        params: { id: string; metadata: NodeMetadata };
        response: { success: boolean };
      };
      deleteNodeMetadata: {
        params: { id: string };
        response: { success: boolean };
      };
      listTemplates: {
        params: Record<string, unknown>;
        response: TemplateMeta[];
      };
      getTemplate: {
        params: { id: string };
        response: TemplateManifest | null;
      };
      createViewFromTemplate: {
        params: { name: string; templateId: string };
        response: { id: string; name: string; file: string };
      };
      saveTemplateThumbnail: {
        params: { templateId: string; pngBase64: string };
        response: WriteTemplateThumbnailResult;
      };
    };
    messages: Record<never, unknown>;
  };
  webview: {
    requests: Record<string, { params: unknown; response: unknown }>;
    messages: {
      canvasRedo: Record<never, unknown>;
      canvasUndo: Record<never, unknown>;
      extensionTaskFired: ExtensionTaskDelivery;
      pluginContentChanged: HostContentChangedEvent;
      openSearch: Record<never, unknown>;
      settingsUpdated: AppSettings;
      trashUpdated: Record<never, unknown>;
      viewsUpdated: Record<never, unknown>;
    };
  };
}

export interface AppInfoResponse {
  channel: string;
  hash: string;
  identifier: string;
  name: string;
  version: string;
}

export interface UpdateCheckResponse {
  currentHash: string;
  error?: string;
  hash: string;
  updateAvailable: boolean;
  version: string;
}

export interface WorkspaceInfoResponse {
  isDefault: boolean;
  path: string;
}

export interface ExportArchiveResponse {
  canceled?: boolean;
  filePath?: string;
  size?: number;
  success: boolean;
}

export interface SwitchWorkspaceResponse {
  canceled?: boolean;
  path?: string;
  success: boolean;
}

type BunRequests = CanvasRPC['bun']['requests'];

/**
 * Handler signatures for a subset of `CanvasRPC['bun']['requests']`, matching
 * the shape Electrobun's `defineRPC` expects for each method.
 */
export type RpcRequestHandlers<K extends keyof BunRequests> = {
  [M in K]: (
    ...args: undefined extends BunRequests[M]['params']
      ? [params?: BunRequests[M]['params']]
      : [params: BunRequests[M]['params']]
  ) =>
    | Awaited<BunRequests[M]['response']>
    | Promise<Awaited<BunRequests[M]['response']>>;
};

export type MainRpc = ReturnType<typeof BrowserView.defineRPC<CanvasRPC>>;
