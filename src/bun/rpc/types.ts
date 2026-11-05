import type { BrowserView } from 'electrobun/bun';
import type {
  AIConnectionSettings,
  AIProvider,
  AITestResult,
} from '../../shared/ai/providerConfig';
import type { AIRunTaskParams, AIRunTaskResponse } from '../../shared/ai/types';
import type { NoteChangedEvent } from '../../shared/contentEvents';
import type {
  ExtensionInstanceLoadError,
  ExtensionInstanceRecord,
} from '../../shared/extensions/instance';
import type { ExtensionPresentation } from '../../shared/extensions/presentation';
import type {
  BlockNoteSaveResult,
  CanvasSaveResult,
} from '../../shared/persistence';
import type {
  DiagnosticsStatus,
  FeedbackInput,
  ReportError,
  SubmitReportResult,
} from '../../shared/support/reports';
import type { OpenAttachmentResult } from '../attachments';
import type { UnlinkedFileEntry } from '../cleanup';
import type { ManifestEdge, ManifestNode } from '../manifest';
import type {
  NodeMetadataMap,
  NodeMetadataPatch,
  TagMutationResult,
  TagSummary,
} from '../nodeMetadata';
import type { PreviewArtifacts } from '../preview';
import type { SearchResult } from '../search';
import type { AppSettings } from '../settings';
import type {
  TemplateManifest,
  TemplateMeta,
  WriteTemplateThumbnailResult,
} from '../templates';
import type { TrashEntry } from '../workspace';

export interface CanvasRPC {
  bun: {
    requests: {
      listCanvasDataDiagnostics: {
        params: Record<string, never>;
        response: import('../dataDiagnostics').CanvasDataDiagnostic[];
      };
      quarantineDamagedTrash: {
        params: { trashId: string; token: string };
        response: { success: boolean };
      };
      readCanvasRecoveryGraph: {
        params: { viewId: string };
        response: import('../../shared/canvasRecovery').RecoveryGraph | null;
      };
      listCanvasRecoveryBackups: {
        params: Record<string, never>;
        response: import('../../shared/canvasRecovery').DiskRecoveryBackup[];
      };
      restoreCanvasSnapshot: {
        params: {
          name: string;
          nodes: ManifestNode[];
          edges: ManifestEdge[];
          workspacePath?: string;
        };
        response: { success: boolean; viewId?: string };
      };
      finishCanvasClones: {
        params: { tokens: string[]; liveReferences: string[] };
        response: { removed: string[]; retained: string[] };
      };
      listTransactionRecovery: {
        params: Record<string, never>;
        response: import('../../shared/transactionRecovery').TransactionRecoveryEntry[];
      };
      resolveTransactionRecovery: {
        params: {
          id: 'canvas';
          token: string;
          action: 'retry' | 'quarantine';
        };
        response: { success: boolean; archivedFile?: string };
      };
      confirmCanvasRecovery: {
        params: { viewId: string; token: string };
        response: { success: boolean };
      };
      loadCanvas: {
        params: { viewId: string };
        response: {
          nodes: ManifestNode[];
          edges: ManifestEdge[];
          extensionInstances?: Record<
            string,
            ExtensionInstanceRecord | ExtensionInstanceLoadError
          >;
          /**
           * Set when the manifest on disk was unreadable and this content
           * came from that backup (e.g. `views/x.canvas.json.bak`). The
           * renderer should warn before autosave keeps it.
           */
          loadIssues?: string[];
          recoveredFrom?: string;
          recoveryToken?: string;
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
        response: CanvasSaveResult;
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
          | {
              record: ExtensionInstanceRecord;
              cloneToken?: string;
              success: true;
            }
          | { success: false };
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
        params: {
          noteId: string;
          workspaceId?: string;
          includeMarkdown?: boolean;
        };
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
          markdown?: string;
          revision?: number;
        };
        response: BlockNoteSaveResult;
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
        params: { id: string; metadata: NodeMetadataPatch };
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
      noteChanged: NoteChangedEvent;
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
