import { Dialog } from '@base-ui/react/dialog';
import {
  AlertTriangle,
  Archive,
  Check,
  ExternalLink,
  Folder,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  type MouseEventHandler,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import {
  type LocaleSetting,
  type SettingsClient,
  TRASH_UPDATED_EVENT,
  type TrashEntry,
  type UnlinkedFileEntry,
  type WorkspaceInfo,
} from '@/settingsClient';
import type { SettingsLocaleStrings } from '../i18n/getLocaleStrings';
import { CanvasDataDiagnostics } from './CanvasDataDiagnostics';
import { RecoverySection } from './RecoverySection';
import { TransactionRecoverySection } from './TransactionRecoverySection';

interface WorkspacePanelProps {
  client: SettingsClient;
  locale: LocaleSetting;
  strings: SettingsLocaleStrings;
}

export function WorkspacePanel({
  client,
  locale,
  strings,
}: WorkspacePanelProps) {
  return (
    <div className="space-y-8">
      <PanelHeading>{strings.workspaceTitle}</PanelHeading>
      <WorkspacePathSection client={client} strings={strings} />
      <TransactionRecoverySection />
      <CanvasDataDiagnostics />
      <RecoverySection />
      <TrashSection client={client} locale={locale} strings={strings} />
      <ContentCleanupSection
        client={client}
        locale={locale}
        strings={strings}
      />
    </div>
  );
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-semibold text-[15px] text-neutral-900 dark:text-neutral-50">
      {children}
    </h2>
  );
}

interface WorkspacePathSectionProps {
  client: SettingsClient;
  strings: SettingsLocaleStrings;
}

function WorkspacePathSection({ client, strings }: WorkspacePathSectionProps) {
  const [info, setInfo] = useState<WorkspaceInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'export' | 'switch' | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: 'error' | 'info' | 'success';
    message: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    client.getWorkspaceInfo().then((next) => {
      if (mounted) {
        setInfo(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  const handleCopy = useCallback(async () => {
    if (!info?.path) {
      return;
    }
    try {
      await navigator.clipboard.writeText(info.path);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be unavailable inside Electrobun in some contexts.
      // Failing silently is fine — the path is still visible on screen.
    }
  }, [info?.path]);

  const handleReveal = useCallback(async () => {
    await client.openWorkspaceFolder();
  }, [client]);

  const handleSwitch = useCallback(async () => {
    setBusy('switch');
    setFeedback(null);
    try {
      const result = await client.switchWorkspace();
      if (result.canceled) {
        return;
      }
      if (!(result.success && result.path)) {
        setFeedback({ kind: 'error', message: strings.workspaceSwitchFailed });
        return;
      }
      setFeedback({
        kind: 'info',
        message: `${strings.workspaceSwitchSuccess(result.path)} ${strings.workspaceRestartRequired}`,
      });
      // Refresh the displayed path even though the new path won't take
      // effect until the next launch — gives the user a visual signal that
      // something changed.
      const refreshed = await client.getWorkspaceInfo();
      setInfo(refreshed);
    } finally {
      setBusy(null);
    }
  }, [
    client,
    strings.workspaceRestartRequired,
    strings.workspaceSwitchFailed,
    strings.workspaceSwitchSuccess,
  ]);

  const handleExport = useCallback(async () => {
    setBusy('export');
    setFeedback(null);
    try {
      const result = await client.exportWorkspaceArchive();
      if (result.canceled) {
        return;
      }
      if (!(result.success && result.filePath)) {
        setFeedback({ kind: 'error', message: strings.workspaceExportFailed });
        return;
      }
      setFeedback({
        kind: 'success',
        message: strings.workspaceExportSuccess(result.filePath),
      });
    } catch {
      setFeedback({ kind: 'error', message: strings.workspaceExportFailed });
    } finally {
      setBusy(null);
    }
  }, [client, strings.workspaceExportFailed, strings.workspaceExportSuccess]);

  return (
    <section aria-labelledby="settings-workspace-path" className="space-y-3">
      <h3
        className="font-medium text-neutral-700 text-xs dark:text-neutral-300"
        id="settings-workspace-path"
      >
        {strings.workspacePathLabel}
      </h3>
      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2">
          <Folder
            className="shrink-0 text-neutral-500 dark:text-neutral-400"
            size={14}
          />
          <p
            className="min-w-0 flex-1 truncate font-mono text-[12px] text-neutral-800 dark:text-neutral-100"
            title={info?.path ?? ''}
          >
            {info?.path ?? '…'}
          </p>
          {info?.isDefault ? (
            <span className="shrink-0 rounded-full bg-neutral-200 px-2 py-0.5 font-medium text-3xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {strings.workspaceDefaultIndicator}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SecondaryButton onClick={handleReveal}>
          <ExternalLink size={13} /> {strings.workspaceOpenInFinder}
        </SecondaryButton>
        <SecondaryButton onClick={handleCopy}>
          {copied ? <Check size={13} /> : null}
          {copied ? strings.workspaceCopyPathDone : strings.workspaceCopyPath}
        </SecondaryButton>
        <SecondaryButton disabled={busy === 'switch'} onClick={handleSwitch}>
          <Folder size={13} /> {strings.workspaceSwitch}
        </SecondaryButton>
        <SecondaryButton disabled={busy === 'export'} onClick={handleExport}>
          <Archive size={13} />{' '}
          {busy === 'export'
            ? strings.workspaceExportInProgress
            : strings.workspaceExportArchive}
        </SecondaryButton>
      </div>
      <p className="text-neutral-600 text-xs leading-relaxed dark:text-neutral-300">
        {strings.workspaceExportHelp}
      </p>
      {feedback ? (
        <p
          className={
            feedback.kind === 'error'
              ? 'text-red-600 text-sm dark:text-red-400'
              : feedback.kind === 'success'
                ? 'text-emerald-700 text-sm dark:text-emerald-400'
                : 'text-accent-strong text-sm'
          }
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}

interface SecondaryButtonProps {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

function SecondaryButton({
  children,
  className,
  disabled,
  onClick,
}: SecondaryButtonProps) {
  return (
    <button
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 font-medium text-[12px] text-neutral-700 transition-colors [-webkit-app-region:no-drag] hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-accent/60 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 ${className ?? ''}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

interface TrashSectionProps {
  client: SettingsClient;
  locale: LocaleSetting;
  strings: SettingsLocaleStrings;
}

interface TrashSectionState {
  actionError: string | null;
  confirmClearAll: boolean;
  entries: TrashEntry[];
  loaded: boolean;
  loadFailed: boolean;
  pendingPurge: TrashEntry | null;
}

const initialTrashSectionState: TrashSectionState = {
  actionError: null,
  confirmClearAll: false,
  entries: [],
  loaded: false,
  loadFailed: false,
  pendingPurge: null,
};

function trashSectionReducer(
  state: TrashSectionState,
  patch: Partial<TrashSectionState>
): TrashSectionState {
  return { ...state, ...patch };
}

function TrashSection({ client, locale, strings }: TrashSectionProps) {
  const [trashState, setTrashState] = useReducer(
    trashSectionReducer,
    initialTrashSectionState
  );
  const {
    actionError,
    confirmClearAll,
    entries,
    loaded,
    loadFailed,
    pendingPurge,
  } = trashState;

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale]
  );

  const reload = useCallback(async () => {
    try {
      const data = await client.listTrash();
      // Sort newest first — matches the user expectation of "most recently
      // deleted" rising to the top.
      const sorted = data.toSorted((a, b) => b.deletedAt - a.deletedAt);
      setTrashState({ entries: sorted, loaded: true, loadFailed: false });
    } catch {
      setTrashState({ loaded: true, loadFailed: true });
    }
  }, [client]);

  useEffect(() => {
    reload();
    const handleTrashUpdated = () => {
      reload();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        reload();
      }
    };
    globalThis.addEventListener(TRASH_UPDATED_EVENT, handleTrashUpdated);
    document.addEventListener('visibilitychange', handleVisibility);
    globalThis.addEventListener('focus', handleTrashUpdated);
    return () => {
      globalThis.removeEventListener(TRASH_UPDATED_EVENT, handleTrashUpdated);
      document.removeEventListener('visibilitychange', handleVisibility);
      globalThis.removeEventListener('focus', handleTrashUpdated);
    };
  }, [reload]);

  const handleRestore = useCallback(
    async (entry: TrashEntry) => {
      setTrashState({ actionError: null });
      try {
        const result = await client.restoreTrash(entry.trashId);
        if (!result.success) {
          setTrashState({ actionError: strings.trashRestoreFailed });
          return;
        }
        await reload();
      } catch {
        setTrashState({ actionError: strings.trashRestoreFailed });
      }
    },
    [client, reload, strings.trashRestoreFailed]
  );

  const handlePurge = useCallback(
    async (entry: TrashEntry) => {
      setTrashState({ actionError: null, pendingPurge: null });
      try {
        const result = await client.purgeTrash(entry.trashId);
        if (!result.success) {
          setTrashState({ actionError: strings.trashPurgeFailed });
          return;
        }
        await reload();
      } catch {
        setTrashState({ actionError: strings.trashPurgeFailed });
      }
    },
    [client, reload, strings.trashPurgeFailed]
  );

  const handleClearAll = useCallback(async () => {
    setTrashState({ actionError: null, confirmClearAll: false });
    try {
      const result = await client.clearAllTrash();
      if (!result.success) {
        setTrashState({ actionError: strings.trashClearAllFailed });
        return;
      }
      await reload();
    } catch {
      setTrashState({ actionError: strings.trashClearAllFailed });
    }
  }, [client, reload, strings.trashClearAllFailed]);

  if (!loaded) {
    return null;
  }

  return (
    <section aria-labelledby="settings-trash-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3
          className="font-medium text-neutral-700 text-xs dark:text-neutral-300"
          id="settings-trash-heading"
        >
          {strings.trashTitle}
        </h3>
        {entries.length > 0 ? (
          <button
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 font-medium text-[12px] text-red-600 transition-colors [-webkit-app-region:no-drag] hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
            onClick={() => setTrashState({ confirmClearAll: true })}
            type="button"
          >
            {strings.trashClearAll}
          </button>
        ) : null}
      </div>
      {loadFailed ? (
        <p className="text-red-600 text-sm dark:text-red-400" role="alert">
          {strings.trashLoadError}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-neutral-500 text-sm dark:text-neutral-400">
          {strings.trashEmpty}
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <TrashRow
              dateFormatter={dateFormatter}
              entry={entry}
              key={entry.trashId}
              onPurge={() => setTrashState({ pendingPurge: entry })}
              onRestore={() => handleRestore(entry)}
              strings={strings}
            />
          ))}
        </ul>
      )}
      {actionError ? (
        <p className="text-red-600 text-sm dark:text-red-400" role="alert">
          {actionError}
        </p>
      ) : null}
      <PurgeConfirmDialog
        entry={pendingPurge}
        onCancel={() => setTrashState({ pendingPurge: null })}
        onConfirm={(entry) => {
          handlePurge(entry);
        }}
        strings={strings}
      />
      <ClearAllConfirmDialog
        count={entries.length}
        onCancel={() => setTrashState({ confirmClearAll: false })}
        onConfirm={handleClearAll}
        open={confirmClearAll}
        strings={strings}
      />
    </section>
  );
}

interface TrashRowProps {
  dateFormatter: Intl.DateTimeFormat;
  entry: TrashEntry;
  onPurge: () => void;
  onRestore: () => void;
  strings: SettingsLocaleStrings;
}

function TrashRow({
  dateFormatter,
  entry,
  onPurge,
  onRestore,
  strings,
}: TrashRowProps) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="min-w-0">
        <p
          className="truncate font-medium text-neutral-900 text-sm dark:text-neutral-100"
          title={entry.trashFile}
        >
          {entry.view.name}
        </p>
        <p className="text-neutral-500 text-xs dark:text-neutral-400">
          {strings.trashDeletedAt(dateFormatter.format(entry.deletedAt))}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          aria-label={strings.trashRestoreAria(entry.view.name)}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 font-medium text-[12px] text-neutral-700 transition-colors [-webkit-app-region:no-drag] hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-200 dark:hover:bg-white/10 dark:hover:text-white"
          onClick={onRestore}
          type="button"
        >
          <RotateCcw size={13} />
        </button>
        <button
          aria-label={strings.trashPurgeAria(entry.view.name)}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 font-medium text-[12px] text-red-600 transition-colors [-webkit-app-region:no-drag] hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
          onClick={onPurge}
          type="button"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

interface PurgeConfirmDialogProps {
  entry: TrashEntry | null;
  onCancel: () => void;
  onConfirm: (entry: TrashEntry) => void;
  strings: SettingsLocaleStrings;
}

function PurgeConfirmDialog({
  entry,
  onCancel,
  onConfirm,
  strings,
}: PurgeConfirmDialogProps) {
  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
      open={entry !== null}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-[60] w-[min(380px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl outline-hidden transition-[transform,opacity] duration-150 data-ending-style:scale-95 data-starting-style:scale-95 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-neutral-900">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <Trash2 size={17} />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="font-semibold text-gray-900 text-sm dark:text-gray-100">
                {strings.purgeConfirmTitle}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-[13px] text-gray-600 leading-5 dark:text-gray-300">
                {entry ? strings.purgeConfirmBody(entry.view.name) : ''}
              </Dialog.Description>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="h-8 rounded-md px-3 font-medium text-[13px] text-gray-600 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={onCancel}
              type="button"
            >
              {strings.purgeConfirmCancel}
            </button>
            <button
              className="h-8 rounded-md bg-red-600 px-3 font-medium text-[13px] text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2 dark:bg-red-500 dark:hover:bg-red-400"
              onClick={() => {
                if (entry) {
                  onConfirm(entry);
                }
              }}
              type="button"
            >
              {strings.purgeConfirmAction}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ClearAllConfirmDialogProps {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  strings: SettingsLocaleStrings;
}

function ClearAllConfirmDialog({
  count,
  onCancel,
  onConfirm,
  open,
  strings,
}: ClearAllConfirmDialogProps) {
  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-[60] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl outline-hidden transition-[transform,opacity] duration-150 data-ending-style:scale-95 data-starting-style:scale-95 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-neutral-900">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <Trash2 size={17} />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="font-semibold text-gray-900 text-sm dark:text-gray-100">
                {strings.trashClearAllConfirmTitle(count)}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-[13px] text-gray-600 leading-5 dark:text-gray-300">
                {strings.trashClearAllConfirmBody(count)}
              </Dialog.Description>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="h-8 rounded-md px-3 font-medium text-[13px] text-gray-600 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={onCancel}
              type="button"
            >
              {strings.purgeConfirmCancel}
            </button>
            <button
              className="h-8 rounded-md bg-red-600 px-3 font-medium text-[13px] text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2 dark:bg-red-500 dark:hover:bg-red-400"
              onClick={onConfirm}
              type="button"
            >
              {strings.trashClearAllConfirmAction}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ContentCleanupSectionProps {
  client: SettingsClient;
  locale: LocaleSetting;
  strings: SettingsLocaleStrings;
}

interface ContentCleanupState {
  confirmOpen: boolean;
  deleteError: number | null;
  entries: UnlinkedFileEntry[] | null;
  scanError: boolean;
  scanning: boolean;
  selected: Set<string>;
}

const initialContentCleanupState: ContentCleanupState = {
  confirmOpen: false,
  deleteError: null,
  entries: null,
  scanError: false,
  scanning: false,
  selected: new Set(),
};

type ContentCleanupPatch =
  | Partial<ContentCleanupState>
  | ((state: ContentCleanupState) => Partial<ContentCleanupState>);

function contentCleanupReducer(
  state: ContentCleanupState,
  patch: ContentCleanupPatch
): ContentCleanupState {
  const resolvedPatch = typeof patch === 'function' ? patch(state) : patch;
  return { ...state, ...resolvedPatch };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ContentCleanupSection({
  client,
  locale,
  strings,
}: ContentCleanupSectionProps) {
  const [cleanupState, setCleanupState] = useReducer(
    contentCleanupReducer,
    initialContentCleanupState
  );
  const { confirmOpen, deleteError, entries, scanError, scanning, selected } =
    cleanupState;

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale]
  );

  const runScan = useCallback(async () => {
    setCleanupState({
      deleteError: null,
      scanError: false,
      scanning: true,
    });
    try {
      const data = await client.scanUnlinkedNotes();
      // Default selection: only files that have a frontmatter id (safer set).
      setCleanupState({
        entries: data,
        selected: new Set(
          data.flatMap((e) => (e.hasFrontmatterId ? [e.file] : []))
        ),
      });
    } catch {
      setCleanupState({ entries: [], scanError: true });
    } finally {
      setCleanupState({ scanning: false });
    }
  }, [client]);

  const toggleOne = useCallback((file: string) => {
    setCleanupState((current) => {
      const next = new Set(current.selected);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return { selected: next };
    });
  }, []);

  const allSelected =
    entries !== null &&
    entries.length > 0 &&
    entries.every((e) => selected.has(e.file));

  const toggleAll = useCallback(() => {
    if (!entries) {
      return;
    }
    setCleanupState({
      selected: allSelected ? new Set() : new Set(entries.map((e) => e.file)),
    });
  }, [allSelected, entries]);

  const performDelete = useCallback(async () => {
    setCleanupState({ confirmOpen: false });
    if (selected.size === 0) {
      return;
    }
    const targets = [...selected];
    try {
      const result = await client.deleteUnlinkedNotes(targets);
      if (result.skipped.length > 0) {
        setCleanupState({ deleteError: result.skipped.length });
      } else {
        setCleanupState({ deleteError: null });
      }
      await runScan();
    } catch {
      setCleanupState({ deleteError: targets.length });
    }
  }, [client, runScan, selected]);

  const selectedCount = selected.size;

  return (
    <section aria-labelledby="settings-cleanup-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3
            className="font-medium text-neutral-700 text-xs dark:text-neutral-300"
            id="settings-cleanup-heading"
          >
            {strings.cleanupTitle}
          </h3>
          <p className="mt-1 text-neutral-500 text-xs dark:text-neutral-400">
            {strings.cleanupDescription}
          </p>
        </div>
        <button
          className="inline-flex h-8 shrink-0 items-center rounded-md border border-neutral-200 bg-white px-3 font-medium text-[12px] text-neutral-700 transition-colors [-webkit-app-region:no-drag] hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          disabled={scanning}
          onClick={runScan}
          type="button"
        >
          {scanning ? strings.cleanupScanning : strings.cleanupScan}
        </button>
      </div>

      {entries === null ? (
        <p className="text-neutral-500 text-sm dark:text-neutral-400">
          {strings.cleanupUnscanned}
        </p>
      ) : null}

      {scanError ? (
        <p className="text-red-600 text-sm dark:text-red-400" role="alert">
          {strings.cleanupScanFailed}
        </p>
      ) : null}

      {entries !== null && entries.length === 0 && !scanError ? (
        <p className="text-neutral-500 text-sm dark:text-neutral-400">
          {strings.cleanupEmpty}
        </p>
      ) : null}

      {entries !== null && entries.length > 0 ? (
        <CleanupList
          allSelected={allSelected}
          dateFormatter={dateFormatter}
          entries={entries}
          onConfirmDelete={() => setCleanupState({ confirmOpen: true })}
          onToggleAll={toggleAll}
          onToggleOne={toggleOne}
          selected={selected}
          selectedCount={selectedCount}
          strings={strings}
        />
      ) : null}

      {deleteError !== null ? (
        <p className="text-red-600 text-sm dark:text-red-400" role="alert">
          {strings.cleanupDeleteFailed(deleteError)}
        </p>
      ) : null}

      <CleanupConfirmDialog
        count={selectedCount}
        onCancel={() => setCleanupState({ confirmOpen: false })}
        onConfirm={performDelete}
        open={confirmOpen}
        strings={strings}
      />
    </section>
  );
}

interface CleanupListProps {
  allSelected: boolean;
  dateFormatter: Intl.DateTimeFormat;
  entries: UnlinkedFileEntry[];
  onConfirmDelete: () => void;
  onToggleAll: () => void;
  onToggleOne: (file: string) => void;
  selected: Set<string>;
  selectedCount: number;
  strings: SettingsLocaleStrings;
}

function CleanupList({
  allSelected,
  dateFormatter,
  entries,
  onConfirmDelete,
  onToggleAll,
  onToggleOne,
  selected,
  selectedCount,
  strings,
}: CleanupListProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-neutral-500 text-xs dark:text-neutral-400">
          <span>{strings.cleanupCount(entries.length)}</span>
          <button
            className="font-medium text-neutral-700 underline-offset-2 hover:underline dark:text-neutral-200"
            onClick={onToggleAll}
            type="button"
          >
            {allSelected
              ? strings.cleanupDeselectAll
              : strings.cleanupSelectAll}
          </button>
        </div>
        <button
          className="inline-flex h-8 shrink-0 items-center rounded-md bg-red-600 px-3 font-medium text-[12px] text-white transition-colors [-webkit-app-region:no-drag] hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-400"
          disabled={selectedCount === 0}
          onClick={onConfirmDelete}
          type="button"
        >
          {strings.cleanupDeleteSelected(selectedCount)}
        </button>
      </div>
      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {entries.map((entry) => (
          <CleanupRow
            checked={selected.has(entry.file)}
            dateFormatter={dateFormatter}
            entry={entry}
            key={entry.file}
            onToggle={() => onToggleOne(entry.file)}
            strings={strings}
          />
        ))}
      </ul>
    </div>
  );
}

interface CleanupRowProps {
  checked: boolean;
  dateFormatter: Intl.DateTimeFormat;
  entry: UnlinkedFileEntry;
  onToggle: () => void;
  strings: SettingsLocaleStrings;
}

function CleanupRow({
  checked,
  dateFormatter,
  entry,
  onToggle,
  strings,
}: CleanupRowProps) {
  const label = entry.title?.trim() || entry.file;
  return (
    <li className="flex items-center gap-3 bg-white px-3 py-2 dark:bg-neutral-900">
      <input
        aria-label={strings.cleanupRowCheckboxAria(entry.file)}
        checked={checked}
        className="size-4 shrink-0 cursor-pointer accent-red-600 dark:accent-red-500"
        onChange={onToggle}
        type="checkbox"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="truncate font-medium text-[13px] text-neutral-900 dark:text-neutral-100"
            title={entry.file}
          >
            {label}
          </span>
          {entry.hasFrontmatterId ? null : (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-3xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
              title={strings.cleanupNoId}
            >
              <AlertTriangle size={10} />
              {strings.cleanupNoId}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-2xs text-neutral-500 dark:text-neutral-400">
          {entry.file} · {formatBytes(entry.size)} ·{' '}
          {strings.cleanupModified(dateFormatter.format(entry.modifiedAt))}
        </div>
      </div>
    </li>
  );
}

interface CleanupConfirmDialogProps {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  strings: SettingsLocaleStrings;
}

function CleanupConfirmDialog({
  count,
  onCancel,
  onConfirm,
  open,
  strings,
}: CleanupConfirmDialogProps) {
  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-[60] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl outline-hidden transition-[transform,opacity] duration-150 data-ending-style:scale-95 data-starting-style:scale-95 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-neutral-900">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <Trash2 size={17} />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="font-semibold text-gray-900 text-sm dark:text-gray-100">
                {strings.cleanupConfirmTitle(count)}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-[13px] text-gray-600 leading-5 dark:text-gray-300">
                {strings.cleanupConfirmBody(count)}
              </Dialog.Description>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="h-8 rounded-md px-3 font-medium text-[13px] text-gray-600 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={onCancel}
              type="button"
            >
              {strings.cleanupConfirmCancel}
            </button>
            <button
              className="h-8 rounded-md bg-red-600 px-3 font-medium text-[13px] text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2 dark:bg-red-500 dark:hover:bg-red-400"
              onClick={onConfirm}
              type="button"
            >
              {strings.cleanupConfirmAction}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
